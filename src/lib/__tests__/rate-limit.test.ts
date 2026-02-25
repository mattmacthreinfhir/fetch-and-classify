import { describe, it, expect, vi, beforeEach } from "vitest";

// Reset the module between tests to clear the in-memory store
beforeEach(() => {
  vi.resetModules();
});

async function getCheckRateLimit() {
  const mod = await import("../rate-limit");
  return mod.checkRateLimit;
}

const CONFIG = { windowMs: 60_000, maxRequests: 3 };

describe("checkRateLimit", () => {
  it("allows requests within the limit", async () => {
    const checkRateLimit = await getCheckRateLimit();

    const r1 = checkRateLimit("user-1", CONFIG);
    const r2 = checkRateLimit("user-1", CONFIG);
    const r3 = checkRateLimit("user-1", CONFIG);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it("blocks requests exceeding the limit", async () => {
    const checkRateLimit = await getCheckRateLimit();

    checkRateLimit("user-1", CONFIG);
    checkRateLimit("user-1", CONFIG);
    checkRateLimit("user-1", CONFIG);

    const result = checkRateLimit("user-1", CONFIG);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThanOrEqual(1000);
  });

  it("returns a positive retryAfterMs when blocked", async () => {
    const checkRateLimit = await getCheckRateLimit();

    for (let i = 0; i < 3; i++) checkRateLimit("user-1", CONFIG);

    const result = checkRateLimit("user-1", CONFIG);

    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("tracks keys independently", async () => {
    const checkRateLimit = await getCheckRateLimit();

    // Fill up user-1
    for (let i = 0; i < 3; i++) checkRateLimit("user-1", CONFIG);
    expect(checkRateLimit("user-1", CONFIG).allowed).toBe(false);

    // user-2 should still be allowed
    expect(checkRateLimit("user-2", CONFIG).allowed).toBe(true);
  });

  it("allows requests again after the window expires", async () => {
    vi.useFakeTimers();

    try {
      const checkRateLimit = await getCheckRateLimit();

      for (let i = 0; i < 3; i++) checkRateLimit("user-1", CONFIG);
      expect(checkRateLimit("user-1", CONFIG).allowed).toBe(false);

      // Advance past the window
      vi.advanceTimersByTime(61_000);

      expect(checkRateLimit("user-1", CONFIG).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
