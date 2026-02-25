import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConsoleLog = vi.fn();
vi.stubGlobal("console", { ...console, log: mockConsoleLog });

import { logger } from "../logger";

beforeEach(() => {
  mockConsoleLog.mockReset();
});

describe("logger", () => {
  it("outputs valid JSON to stdout", () => {
    logger.info("hello");

    expect(mockConsoleLog).toHaveBeenCalledOnce();
    const output = mockConsoleLog.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed).toBeDefined();
  });

  it("includes timestamp, level, and message", () => {
    logger.info("test message");

    const parsed = JSON.parse(mockConsoleLog.mock.calls[0][0]);
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("test message");
  });

  it("logs at warn level", () => {
    logger.warn("watch out");

    const parsed = JSON.parse(mockConsoleLog.mock.calls[0][0]);
    expect(parsed.level).toBe("warn");
    expect(parsed.message).toBe("watch out");
  });

  it("logs at error level", () => {
    logger.error("something broke");

    const parsed = JSON.parse(mockConsoleLog.mock.calls[0][0]);
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("something broke");
  });

  it("includes meta fields in output", () => {
    logger.info("pipeline event", { id: "abc-123", url: "https://example.com", durationMs: 450 });

    const parsed = JSON.parse(mockConsoleLog.mock.calls[0][0]);
    expect(parsed.id).toBe("abc-123");
    expect(parsed.url).toBe("https://example.com");
    expect(parsed.durationMs).toBe(450);
  });

  it("works without meta argument", () => {
    logger.info("no meta");

    const parsed = JSON.parse(mockConsoleLog.mock.calls[0][0]);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("no meta");
    // Should only have timestamp, level, message
    expect(Object.keys(parsed)).toEqual(["timestamp", "level", "message"]);
  });
});
