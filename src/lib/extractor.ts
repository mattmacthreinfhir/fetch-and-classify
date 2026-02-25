import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { ExtractedContent } from "@/types";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 1_048_576; // 1MB — enforced during streaming

/**
 * Fetches a URL and extracts article content using Mozilla Readability.
 * Falls back to <meta> tag and JSON-LD extraction if Readability can't parse.
 */
export async function extractContent(url: string): Promise<ExtractedContent> {
  const response = await fetchWithTimeout(url);

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new Error(
      `Unsupported content type: ${contentType}. Only HTML and plain text pages are supported.`
    );
  }

  const body = await readBodyWithLimit(response, MAX_BODY_BYTES);

  // Plain text — return directly without HTML parsing
  if (contentType.includes("text/plain")) {
    const text = body.trim();
    if (!text) {
      throw new Error("Could not extract any text content from the page.");
    }
    return {
      title: null,
      body_text: text,
      author: null,
      publish_date: null,
    };
  }

  const html = body;

  if (isProtectedPage(html)) {
    throw new Error(
      `This site is protected by bot detection (likely Cloudflare). ` +
      `Server-side extraction is blocked for this URL.`
    );
  }

  if (isAuthGatedPage(html)) {
    throw new Error(
      `This page appears to require authentication (login/signup wall detected). ` +
      `Content cannot be extracted without access.`
    );
  }

  const { document } = parseHTML(html);
  const jsonLd = parseJsonLd(document);

  // Try Readability first
  const reader = new Readability(document);
  const article = reader.parse();

  if (article?.textContent) {
    return {
      title: article.title || extractTitle(document, jsonLd),
      body_text: article.textContent.trim(),
      author: article.byline || extractAuthor(document, jsonLd),
      publish_date: normalizeDate(article.publishedTime) || extractDate(document, jsonLd),
    };
  }

  // Fallback: meta tags + body text
  const bodyText = document.body?.textContent?.trim();
  if (!bodyText) {
    throw new Error("Could not extract any text content from the page.");
  }

  return {
    title: extractTitle(document, jsonLd),
    body_text: bodyText,
    author: extractAuthor(document, jsonLd),
    publish_date: extractDate(document, jsonLd),
  };
}

/**
 * Normalizes a URL for deduplication:
 *  - Strips fragment (#...)
 *  - Strips common tracking params (utm_*)
 *  - Lowercases the hostname
 */
export function normalizeUrl(raw: string): string {
  const parsed = new URL(raw);
  parsed.hash = "";

  // Remove tracking params
  const trackingPrefixes = ["utm_", "fbclid", "gclid", "ref"];
  for (const key of [...parsed.searchParams.keys()]) {
    if (trackingPrefixes.some((p) => key.startsWith(p))) {
      parsed.searchParams.delete(key);
    }
  }

  // Lowercase hostname
  parsed.hostname = parsed.hostname.toLowerCase();

  // Remove trailing slash on path (unless it's just "/")
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

// --- SSRF protection ---

const BLOCKED_HOSTNAMES = ["localhost", "0.0.0.0"];

const PRIVATE_IP_RANGES = [
  /^127\./,                          // loopback
  /^10\./,                           // class A private
  /^172\.(1[6-9]|2\d|3[01])\./,     // class B private
  /^192\.168\./,                     // class C private
  /^169\.254\./,                     // link-local / cloud metadata
  /^0\./,                            // "this" network
  /^fc00:/i,                         // IPv6 unique-local
  /^fe80:/i,                         // IPv6 link-local
  /^::1$/,                           // IPv6 loopback
];

function isPrivateUrl(url: string): boolean {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.includes(hostname)) return true;
  if (PRIVATE_IP_RANGES.some((re) => re.test(hostname))) return true;
  if (!["http:", "https:"].includes(parsed.protocol)) return true;

  return false;
}

// --- Fetch with timeout and size-limited body reading ---

async function fetchWithTimeout(url: string): Promise<Response> {
  if (isPrivateUrl(url)) {
    throw new Error("URLs pointing to private or internal networks are not allowed.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ContentBot/1.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      if (response.status === 403) {
        const body = await response.text();
        if (isProtectedPage(body)) {
          throw new Error(
            `This site is protected by bot detection (likely Cloudflare). ` +
            `Server-side extraction is blocked for this URL.`
          );
        }
        throw new Error(
          `HTTP 403: Access denied. The site may require authentication or block automated requests.`
        );
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    }

    // Provide helpful messages for common network errors
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(`Network error: could not connect to ${new URL(url).hostname}`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readBodyWithLimit(
  response: Response,
  maxBytes: number
): Promise<string> {
  // If Content-Length is available, check it before reading
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new Error(
      `Page too large (${(parseInt(contentLength, 10) / 1024).toFixed(0)}KB). ` +
      `Max is ${(maxBytes / 1024).toFixed(0)}KB.`
    );
  }

  // Stream the body, enforcing the size limit as we go
  const reader = response.body?.getReader();
  if (!reader) {
    return response.text();
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        reader.cancel();
        throw new Error(
          `Page too large (>${(maxBytes / 1024).toFixed(0)}KB). Download aborted.`
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(concatUint8Arrays(chunks));
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.byteLength;
  }
  return result;
}

// --- Metadata extraction helpers ---

interface JsonLdData {
  headline?: string;
  author?: string;
  datePublished?: string;
}

function parseJsonLd(document: Document): JsonLdData | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || "");
      // Handle both single object and array of objects
      const obj = Array.isArray(data) ? data[0] : data;
      if (obj?.["@type"] === "Article" || obj?.["@type"] === "NewsArticle" || obj?.["@type"] === "BlogPosting") {
        const authorField = obj.author;
        const authorName =
          typeof authorField === "string"
            ? authorField
            : Array.isArray(authorField)
              ? authorField.map((a: { name?: string }) => a.name).filter(Boolean).join(", ")
              : authorField?.name || null;

        return {
          headline: obj.headline || null,
          author: authorName,
          datePublished: obj.datePublished || null,
        };
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  }
  return null;
}

function extractTitle(document: Document, jsonLd: JsonLdData | null): string | null {
  return (
    metaContent(document, "og:title") ||
    metaContent(document, "twitter:title") ||
    jsonLd?.headline ||
    document.title || // least specific — often includes site name
    null
  );
}

function extractAuthor(document: Document, jsonLd: JsonLdData | null): string | null {
  return (
    metaContent(document, "author") ||
    metaContent(document, "article:author") ||
    metaContent(document, "dc.creator") ||
    jsonLd?.author ||
    null
  );
}

function extractDate(document: Document, jsonLd: JsonLdData | null): string | null {
  const raw =
    metaContent(document, "article:published_time") ||
    metaContent(document, "datePublished") ||
    metaContent(document, "date") ||
    metaContent(document, "dc.date") ||
    jsonLd?.datePublished ||
    null;

  return normalizeDate(raw);
}

/**
 * Attempts to parse a date string into ISO 8601 format.
 * Returns null if the date is unparseable — avoids sending
 * invalid timestamps to Postgres TIMESTAMPTZ columns.
 */
function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

// --- Bot protection detection ---

const BOT_PROTECTION_SIGNALS = [
  "cf-browser-verification",
  "cloudflare",
  "cf-challenge",
  "just a moment",
  "checking your browser",
  "verify you are human",
  "ddos-guard",
  "sucuri",
  "incapsula",
  "akamai",
];

function isProtectedPage(html: string): boolean {
  const lower = html.toLowerCase();
  return BOT_PROTECTION_SIGNALS.some((signal) => lower.includes(signal));
}

// --- Auth-gated page detection ---

const AUTH_GATE_SIGNALS = [
  "sign in to continue",
  "log in to continue",
  "login to continue",
  "sign up to read",
  "create an account",
  "create account to continue",
  "subscribe to read",
  "members only",
  "premium content",
  "paywall",
];

function isAuthGatedPage(html: string): boolean {
  const lower = html.toLowerCase();
  const signalCount = AUTH_GATE_SIGNALS.filter((s) => lower.includes(s)).length;
  // Require at least one signal AND very little article content
  // (some legitimate pages mention "sign in" in a header/nav)
  if (signalCount === 0) return false;
  // Check if Readability would find substantial content — if it does, the page isn't truly gated
  const { document: doc } = parseHTML(html);
  const textLength = doc.body?.textContent?.trim().length ?? 0;
  return textLength < 500;
}

function metaContent(document: Document, nameOrProperty: string): string | null {
  const el =
    document.querySelector(`meta[property="${nameOrProperty}"]`) ??
    document.querySelector(`meta[name="${nameOrProperty}"]`);
  return el?.getAttribute("content") || null;
}
