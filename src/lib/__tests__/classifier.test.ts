import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtractedContent } from "@/types";

// vi.hoisted runs at hoist-time, so mockCreate is available to vi.mock
const { mockCreate, APIError } = vi.hoisted(() => {
  const mockCreate = vi.fn();

  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return { mockCreate, APIError };
});

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: mockCreate };
    static APIError = APIError;
  }
  return { default: MockAnthropic, APIError };
});

import { classifyContent } from "../classifier";

function claudeResponse(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

const sampleContent: ExtractedContent = {
  title: "What Is Cortisol?",
  body_text:
    "Cortisol is the body's main stress hormone. It works with your brain to control mood, motivation, and fear. Your adrenal glands make cortisol.",
  author: "WebMD Contributors",
  publish_date: "2025-01-15",
};

beforeEach(() => {
  mockCreate.mockReset();
});

describe("classifyContent", () => {
  it("classifies content and returns valid categories, summary, confidence, and model", async () => {
    mockCreate.mockResolvedValueOnce(
      claudeResponse(
        JSON.stringify({
          categories: ["hormones", "medical-treatments"],
          summary: "An overview of cortisol and its role as the body's stress hormone.",
          confidence_score: 0.92,
        })
      )
    );

    const result = await classifyContent(sampleContent);

    expect(result.categories).toEqual(["hormones", "medical-treatments"]);
    expect(result.summary).toContain("cortisol");
    expect(result.confidence_score).toBe(0.92);
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("strips markdown fences from LLM response", async () => {
    mockCreate.mockResolvedValueOnce(
      claudeResponse(
        '```json\n{"categories": ["nutrition"], "summary": "A guide to healthy eating habits and nutrition.", "confidence_score": 0.88}\n```'
      )
    );

    const result = await classifyContent(sampleContent);

    expect(result.categories).toEqual(["nutrition"]);
    expect(result.confidence_score).toBe(0.88);
  });

  it("rejects invalid categories from LLM", async () => {
    mockCreate.mockResolvedValue(
      claudeResponse(
        JSON.stringify({
          categories: ["invalid-category"],
          summary: "Some summary text here.",
          confidence_score: 0.5,
        })
      )
    );

    await expect(classifyContent(sampleContent)).rejects.toThrow();
  });

  it("handles empty categories by falling back to lifestyle with low confidence", async () => {
    mockCreate.mockResolvedValueOnce(
      claudeResponse(
        JSON.stringify({
          categories: [],
          summary: "Some summary text here.",
          confidence_score: 0.5,
        })
      )
    );

    const result = await classifyContent(sampleContent);
    expect(result.categories).toEqual(["lifestyle"]);
    expect(result.confidence_score).toBe(0.15);
  });

  it("rejects confidence score out of range", async () => {
    mockCreate.mockResolvedValue(
      claudeResponse(
        JSON.stringify({
          categories: ["fitness"],
          summary: "A fitness article summary.",
          confidence_score: 1.5,
        })
      )
    );

    await expect(classifyContent(sampleContent)).rejects.toThrow();
  });

  it("retries on transient errors then succeeds", async () => {
    mockCreate
      .mockRejectedValueOnce(new Error("Connection timeout"))
      .mockResolvedValueOnce(
        claudeResponse(
          JSON.stringify({
            categories: ["mental-wellness"],
            summary: "An article about stress management techniques.",
            confidence_score: 0.9,
          })
        )
      );

    const result = await classifyContent(sampleContent);

    expect(result.categories).toEqual(["mental-wellness"]);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 401 auth errors", async () => {
    mockCreate.mockRejectedValueOnce(new APIError(401, "Invalid API key"));

    await expect(classifyContent(sampleContent)).rejects.toThrow();
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("does not retry on 400 bad request errors", async () => {
    mockCreate.mockRejectedValueOnce(new APIError(400, "Bad request"));

    await expect(classifyContent(sampleContent)).rejects.toThrow();
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("builds user message with title and author when present", async () => {
    mockCreate.mockResolvedValueOnce(
      claudeResponse(
        JSON.stringify({
          categories: ["hormones"],
          summary: "An overview of cortisol, the stress hormone.",
          confidence_score: 0.9,
        })
      )
    );

    await classifyContent(sampleContent);

    const callArgs = mockCreate.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("<title>What Is Cortisol?</title>");
    expect(userMsg).toContain("<author>WebMD Contributors</author>");
    expect(userMsg).toContain("<body>");
    expect(userMsg).toContain("<article>");
  });

  it("omits title and author from message when null", async () => {
    mockCreate.mockResolvedValueOnce(
      claudeResponse(
        JSON.stringify({
          categories: ["lifestyle"],
          summary: "A general article about lifestyle choices.",
          confidence_score: 0.7,
        })
      )
    );

    await classifyContent({
      title: null,
      body_text: "Some content here.",
      author: null,
      publish_date: null,
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).not.toContain("<title>");
    expect(userMsg).not.toContain("<author>");
    expect(userMsg).toContain("<body>Some content here.</body>");
  });

  it("truncates very long body text", async () => {
    const longBody = "x".repeat(20_000);
    mockCreate.mockResolvedValueOnce(
      claudeResponse(
        JSON.stringify({
          categories: ["lifestyle"],
          summary: "A long article that was truncated for classification.",
          confidence_score: 0.75,
        })
      )
    );

    await classifyContent({
      title: "Long Article",
      body_text: longBody,
      author: null,
      publish_date: null,
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("[Content truncated for classification]");
    expect(userMsg.length).toBeLessThan(longBody.length);
  });
});
