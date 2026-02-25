import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { ExtractedContent } from "@/types";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_LENGTH = 500_000; // ~500KB of HTML, reject anything larger

/**
 * Fetches a URL and extracts article content using Mozilla Readability.
 * Falls back to <meta> tag extraction if Readability can't parse the page.
 */
export async function extractContent(url: string): Promise<ExtractedContent> {
  const response = await fetchWithTimeout(url);

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new Error(
      `Unsupported content type: ${contentType}. Only HTML pages are supported.`
    );
  }

  const html = await response.text();
  if (html.length > MAX_BODY_LENGTH) {
    throw new Error(
      `Page too large (${(html.length / 1024).toFixed(0)}KB). Max is ${MAX_BODY_LENGTH / 1024}KB.`
    );
  }

  // Some sites return 200 with a challenge page instead of a proper 403
  if (isProtectedPage(html)) {
    throw new Error(
      `This site is protected by bot detection (likely Cloudflare). ` +
      `Server-side extraction is blocked for this URL.`
    );
  }

  const dom = new JSDOM(html, { url });
  const document = dom.window.document;

  // Try Readability first
  const reader = new Readability(document);
  const article = reader.parse();

  if (article?.textContent) {
    return {
      title: article.title || metaContent(document, "og:title") || null,
      body_text: article.textContent.trim(),
      author: article.byline || metaContent(document, "author") || null,
      publish_date: article.publishedTime || metaContent(document, "article:published_time") || null,
    };
  }

  // Fallback: extract from meta tags and body text
  const bodyText = document.body?.textContent?.trim();
  if (!bodyText) {
    throw new Error("Could not extract any text content from the page.");
  }

  return {
    title: metaContent(document, "og:title") || document.title || null,
    body_text: bodyText,
    author: metaContent(document, "author") || null,
    publish_date: metaContent(document, "article:published_time") || null,
  };
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; TelloryBot/1.0; +https://tellory.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      if (response.status === 403) {
        // Read body to detect bot protection vs. genuine 403
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
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

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

function metaContent(document: Document, nameOrProperty: string): string | null {
  const el =
    document.querySelector(`meta[property="${nameOrProperty}"]`) ??
    document.querySelector(`meta[name="${nameOrProperty}"]`);
  return el?.getAttribute("content") || null;
}
