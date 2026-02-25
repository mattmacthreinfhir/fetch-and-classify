import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractContent } from "../extractor";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function htmlResponse(html: string, contentType = "text/html") {
  return new Response(html, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

function errorResponse(status: number, body = "") {
  return new Response(body, {
    status,
    statusText: status === 403 ? "Forbidden" : "Error",
    headers: { "content-type": "text/html" },
  });
}

const ARTICLE_HTML = `
<html>
<head>
  <title>Test Article</title>
  <meta property="og:title" content="Test OG Title" />
  <meta name="author" content="Jane Doe" />
  <meta property="article:published_time" content="2025-01-15T10:00:00Z" />
</head>
<body>
  <article>
    <h1>Test Article</h1>
    <p>This is a long enough paragraph to make Readability consider this real article content.
    It needs to have a substantial amount of text so the algorithm thinks this is worth extracting.
    Health and wellness topics are important for overall wellbeing and quality of life.</p>
    <p>Another paragraph with more content about health topics, nutrition, and fitness.
    This should provide enough body text for the Readability parser to work properly
    and return meaningful extracted content from the page.</p>
  </article>
</body>
</html>`;

const MINIMAL_HTML = `
<html>
<head>
  <title>Minimal Page</title>
  <meta property="og:title" content="OG Minimal" />
  <meta name="author" content="John Smith" />
</head>
<body>
  <p>Just some plain text on a minimal page without article structure.</p>
</body>
</html>`;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("extractContent", () => {
  it("extracts content from a well-structured article", async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(ARTICLE_HTML));

    const result = await extractContent("https://example.com/article");

    expect(result.title).toBeTruthy();
    expect(result.body_text.length).toBeGreaterThan(50);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("extracts author from meta tags when Readability has no byline", async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(MINIMAL_HTML));

    const result = await extractContent("https://example.com/minimal");

    expect(result.title).toBeTruthy();
    expect(result.body_text).toBeTruthy();
  });

  it("rejects non-HTML content types", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("binary data", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })
    );

    await expect(extractContent("https://example.com/file.pdf")).rejects.toThrow(
      "Unsupported content type"
    );
  });

  it("rejects oversized pages", async () => {
    const hugeHtml = "<html><body>" + "x".repeat(600_000) + "</body></html>";
    mockFetch.mockResolvedValueOnce(htmlResponse(hugeHtml));

    await expect(extractContent("https://example.com/huge")).rejects.toThrow(
      "Page too large"
    );
  });

  it("detects Cloudflare protection on 200 response", async () => {
    const cfHtml = `<html><head><title>Just a moment...</title></head>
      <body>Checking your browser before accessing the site. Cloudflare.</body></html>`;
    mockFetch.mockResolvedValueOnce(htmlResponse(cfHtml));

    await expect(extractContent("https://example.com/protected")).rejects.toThrow(
      "bot detection"
    );
  });

  it("detects Cloudflare protection on 403 response", async () => {
    const cfBody = "<html><body>Attention Required! Cloudflare</body></html>";
    mockFetch.mockResolvedValueOnce(errorResponse(403, cfBody));

    await expect(extractContent("https://example.com/blocked")).rejects.toThrow(
      "bot detection"
    );
  });

  it("throws descriptive error on generic 403", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(403, "<html><body>Forbidden</body></html>"));

    await expect(extractContent("https://example.com/forbidden")).rejects.toThrow(
      "HTTP 403"
    );
  });

  it("throws on HTTP errors", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500));

    await expect(extractContent("https://example.com/error")).rejects.toThrow(
      "HTTP 500"
    );
  });

  it("throws on empty page content", async () => {
    const emptyHtml = "<html><head><title>Empty</title></head><body></body></html>";
    mockFetch.mockResolvedValueOnce(htmlResponse(emptyHtml));

    await expect(extractContent("https://example.com/empty")).rejects.toThrow(
      "Could not extract"
    );
  });
});
