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

// Mock logger (suppress log output in tests)
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { processUrl, runPipeline, reanalyzeRecord } from "../pipeline";

/**
 * Sets up the Supabase mock chain for processUrl.
 * Call order: select existing → insert → update(extracting) → update(classifying) → update(completed/failed)
 */
function setupProcessUrlChain(responses: {
  selectExisting?: { data: unknown; error?: unknown };
  insert?: { data: unknown; error?: unknown };
  updateCompleted?: { data: unknown; error?: unknown };
  updateFailed?: { data?: unknown; error?: unknown };
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

    // Calls 3+: status updates (extracting, classifying, completed/failed)
    return makeUpdateMock(responses);
  });
}

/**
 * Sets up the Supabase mock chain for runPipeline/reanalyzeRecord.
 * Call order: update(extracting) → update(classifying) → update(completed/failed)
 * For reanalyzeRecord: select → update(clear error) → update(extracting) → ...
 */
function setupRunPipelineChain(responses: {
  updateCompleted?: { data: unknown; error?: unknown };
  updateFailed?: { data?: unknown; error?: unknown };
}) {
  mockFrom.mockImplementation(() => makeUpdateMock(responses));
}

function setupReanalyzeChain(responses: {
  selectExisting?: { data: unknown; error?: unknown };
  updateCompleted?: { data: unknown; error?: unknown };
  updateFailed?: { data?: unknown; error?: unknown };
}) {
  let callCount = 0;

  mockFrom.mockImplementation(() => {
    callCount++;

    // Call 1: select existing record
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

    // Call 2+: clear error + status updates
    return makeUpdateMock(responses);
  });
}

function makeUpdateMock(responses: {
  updateCompleted?: { data: unknown; error?: unknown };
  updateFailed?: { data?: unknown; error?: unknown };
}) {
  return {
    update: (data: Record<string, unknown>) => ({
      eq: () => {
        // If this is the completed update (has categories), chain select/single
        if (data.status === "completed" && responses.updateCompleted) {
          return {
            select: () => ({
              single: () => Promise.resolve(responses.updateCompleted),
            }),
          };
        }
        // If this is the failed update, return directly
        if (data.status === "failed") {
          return Promise.resolve(responses.updateFailed ?? { error: null });
        }
        // Status stage updates (extracting, classifying, clear error) — just resolve
        return Promise.resolve({ error: null });
      },
    }),
  };
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
    setupProcessUrlChain({ selectExisting: { data: existing } });

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

    setupProcessUrlChain({
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

    setupProcessUrlChain({
      selectExisting: { data: null },
      updateCompleted: { data: completedRecord, error: null },
    });

    mockExtractContent.mockResolvedValueOnce(mockExtracted);
    mockClassifyContent.mockResolvedValueOnce(lowConfidence);

    const result = await processUrl("https://example.com");

    expect(result.needs_review).toBe(true);
  });

  it("marks record as failed when extraction throws", async () => {
    setupProcessUrlChain({
      selectExisting: { data: null },
      updateFailed: { error: null },
    });

    mockExtractContent.mockRejectedValueOnce(new Error("HTTP 403: Access denied"));

    await expect(processUrl("https://example.com")).rejects.toThrow("HTTP 403");
    expect(mockClassifyContent).not.toHaveBeenCalled();
  });

  it("marks record as failed when classification throws", async () => {
    setupProcessUrlChain({
      selectExisting: { data: null },
      updateFailed: { error: null },
    });

    mockExtractContent.mockResolvedValueOnce(mockExtracted);
    mockClassifyContent.mockRejectedValueOnce(new Error("LLM timeout"));

    await expect(processUrl("https://example.com")).rejects.toThrow("LLM timeout");
  });

  it("throws when insert fails", async () => {
    setupProcessUrlChain({
      selectExisting: { data: null },
      insert: { data: null, error: { message: "duplicate key" } },
    });

    await expect(processUrl("https://example.com")).rejects.toThrow(
      "Failed to create record"
    );
  });
});

describe("runPipeline", () => {
  it("runs extract → classify → store for an existing record", async () => {
    const completedRecord = {
      id: "test-uuid",
      url: "https://example.com",
      status: "completed",
      categories: ["nutrition"],
      confidence_score: 0.88,
      needs_review: false,
    };

    setupRunPipelineChain({
      updateCompleted: { data: completedRecord, error: null },
    });

    mockExtractContent.mockResolvedValueOnce(mockExtracted);
    mockClassifyContent.mockResolvedValueOnce(mockClassification);

    const result = await runPipeline("test-uuid", "https://example.com");

    expect(result.status).toBe("completed");
    expect(mockExtractContent).toHaveBeenCalledWith("https://example.com");
    expect(mockClassifyContent).toHaveBeenCalledWith(mockExtracted);
  });

  it("marks as failed when extraction throws", async () => {
    setupRunPipelineChain({ updateFailed: { error: null } });

    mockExtractContent.mockRejectedValueOnce(new Error("Timeout"));

    await expect(runPipeline("test-uuid", "https://example.com")).rejects.toThrow("Timeout");
  });
});

describe("reanalyzeRecord", () => {
  it("re-runs pipeline on existing record", async () => {
    const existing = { id: "test-uuid", url: "https://example.com", status: "completed" };
    const reanalyzed = { ...existing, categories: ["fitness"], confidence_score: 0.9 };

    setupReanalyzeChain({
      selectExisting: { data: existing },
      updateCompleted: { data: reanalyzed, error: null },
    });

    mockExtractContent.mockResolvedValueOnce(mockExtracted);
    mockClassifyContent.mockResolvedValueOnce(mockClassification);

    const result = await reanalyzeRecord("test-uuid");

    expect(result).toEqual(reanalyzed);
    expect(mockExtractContent).toHaveBeenCalledWith("https://example.com");
  });

  it("throws when record not found", async () => {
    setupReanalyzeChain({
      selectExisting: { data: null, error: { message: "not found" } },
    });

    await expect(reanalyzeRecord("missing-id")).rejects.toThrow("Record not found");
    expect(mockExtractContent).not.toHaveBeenCalled();
  });

  it("marks as failed when extraction throws during reanalysis", async () => {
    const existing = { id: "test-uuid", url: "https://example.com", status: "completed" };

    setupReanalyzeChain({
      selectExisting: { data: existing },
      updateFailed: { error: null },
    });

    mockExtractContent.mockRejectedValueOnce(new Error("Bot detection"));

    await expect(reanalyzeRecord("test-uuid")).rejects.toThrow("Bot detection");
  });
});
