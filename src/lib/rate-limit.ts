interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

// Store timestamps of recent requests, keyed by identifier
const requestLog = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Get existing timestamps, filter to current window
  const timestamps = (requestLog.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= config.maxRequests) {
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  // Record this request
  timestamps.push(now);
  requestLog.set(key, timestamps);

  return { allowed: true, retryAfterMs: 0 };
}

// Periodic cleanup to prevent memory leaks (runs every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

if (typeof globalThis !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of requestLog) {
      const recent = timestamps.filter((t) => t > now - 60_000);
      if (recent.length === 0) {
        requestLog.delete(key);
      } else {
        requestLog.set(key, recent);
      }
    }
  }, CLEANUP_INTERVAL);
  // Don't keep the process alive for cleanup
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }
}
