import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase
const mockFrom = vi.fn();

vi.mock("../supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// Mock extractor
const mockExtractContent = vi.fn();
vi.mock("../extractor", () => ({
  extractContent: (...args: unknown[]) => mockExtractContent(...args),
  normalizeUrl: (url: string) => url, // pass-through in tests
}));

// Mock classifier
const mockClassifyContent = vi.fn();
vi.mock("../classifier", () => ({
  classifyContent: (...args: unknown[]) => mockClassifyContent(...args),
}));

import { processUrl } from "../pipeline";

function setupSupabaseChain(responses: {
  selectExisting?: { data: unknown; error?: unknown };
  insert?: { data: unknown; error?: unknown };
  updateProcessing?: { data: unknown; error?: unknown };
  updateCompleted?: { data: unknown; error?: unknown };
  updateFailed?: { data: unknown; error?: unknown };
}) {
  let callCount = 0;

  mockFrom.mockImplementation(() => {
    callCount++;

    // Call 1: select existing
    if (callCount === 1) {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(
                responses.selectExisting ?? { data: null, error: null }
              ),
          }),
        }),
      };
    }

    // Call 2: insert
    if (callCount === 2) {
      return {
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve(
                responses.insert ?? {
                  data: { id: "test-uuid", url: "https://example.com", status: "pending" },
                  error: null,
                }
              ),
          }),
        }),
      };
    }

    // Call 3: update to processing
    if (callCount === 3) {
      return {
        update: () => ({
          eq: () => Promise.resolve(responses.updateProcessing ?? { error: null }),
        }),
      };
    }

    // Call 4: update completed or failed
    if (callCount === 4) {
      return {
        update: () => ({
          eq: () => {
            // If it has .select() chaining, it's the completed update
            if (responses.updateCompleted) {
              return {
                select: () => ({
                  single: () => Promise.resolve(responses.updateCompleted),
                }),
              };
            }
            // Otherwise it's a failed update (no select chain needed)
            return Promise.resolve(responses.updateFailed ?? { error: null });
          },
        }),
      };
    }

    // Fallback for any additional calls (e.g., failed update after completed update fails)
    return {
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    };
  });
}

const mockExtracted = {
  title: "Test Article",
  body_text: "Article body text about health.",
  author: "Test Author",
  publish_date: "2025-01-15",
};

const mockClassification = {
  categories: ["hormones", "medical-treatments"],
  summary: "A test article summary.",
  confidence_score: 0.92,
  model: "claude-sonnet-4-20250514",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processUrl", () => {
  it("returns existing record if URL already ingested", async () => {
    const existing = { id: "existing-id", url: "https://example.com", status: "completed" };
    setupSupabaseChain({ selectExisting: { data: existing } });

    const result = await processUrl("https://example.com");

    expect(result).toEqual(existing);
    expect(mockExtractContent).not.toHaveBeenCalled();
    expect(mockClassifyContent).not.toHaveBeenCalled();
  });

  it("runs full pipeline: extract → classify → store", async () => {
    const completedRecord = {
      id: "test-uuid",
      url: "https://example.com",
      status: "completed",
      title: "Test Article",
      categories: ["hormones", "medical-treatments"],
      confidence_score: 0.92,
      needs_review: false,
    };

    setupSupabaseChain({
      selectExisting: { data: null },
      updateCompleted: { data: completedRecord, error: null },
    });

    mockExtractContent.mockResolvedValueOnce(mockExtracted);
    mockClassifyContent.mockResolvedValueOnce(mockClassification);

    const result = await processUrl("https://example.com");

    expect(mockExtractContent).toHaveBeenCalledWith("https://example.com");
    expect(mockClassifyContent).toHaveBeenCalledWith(mockExtracted);
    expect(result.status).toBe("completed");
    expect(result.categories).toEqual(["hormones", "medical-treatments"]);
  });

  it("sets needs_review when confidence is below threshold", async () => {
    const lowConfidence = { ...mockClassification, confidence_score: 0.5 };
    const completedRecord = {
      id: "test-uuid",
      url: "https://example.com",
      status: "completed",
      needs_review: true,
      confidence_score: 0.5,
    };

    setupSupabaseChain({
      selectExisting: { data: null },
      updateCompleted: { data: completedRecord, error: null },
    });

    mockExtractContent.mockResolvedValueOnce(mockExtracted);
    mockClassifyContent.mockResolvedValueOnce(lowConfidence);

    const result = await processUrl("https://example.com");

    expect(result.needs_review).toBe(true);
  });

  it("marks record as failed when extraction throws", async () => {
    setupSupabaseChain({
      selectExisting: { data: null },
      updateFailed: { error: null },
    });

    mockExtractContent.mockRejectedValueOnce(new Error("HTTP 403: Access denied"));

    await expect(processUrl("https://example.com")).rejects.toThrow("HTTP 403");
    expect(mockClassifyContent).not.toHaveBeenCalled();
  });

  it("marks record as failed when classification throws", async () => {
    setupSupabaseChain({
      selectExisting: { data: null },
      updateFailed: { error: null },
    });

    mockExtractContent.mockResolvedValueOnce(mockExtracted);
    mockClassifyContent.mockRejectedValueOnce(new Error("LLM timeout"));

    await expect(processUrl("https://example.com")).rejects.toThrow("LLM timeout");
  });

  it("throws when insert fails", async () => {
    setupSupabaseChain({
      selectExisting: { data: null },
      insert: { data: null, error: { message: "duplicate key" } },
    });

    await expect(processUrl("https://example.com")).rejects.toThrow(
      "Failed to create record"
    );
  });
});
