// In-memory rate limiter (no redis) used to protect the public demo: it throttles
// per-session/per-chat turns, caps process-wide Gemini spend, and cools down the
// alert-test endpoint. It combines two guards on the same key:
//   - a minimum spacing between consecutive allowed hits (anti-burst), and
//   - a sliding-window cap of N hits per window (quota protection).
// The clock is injectable so tests stay deterministic — never reads Date.now()
// directly when a `now` is supplied.

export interface RateLimitDecision {
  allowed: boolean;
  /** Milliseconds the caller should wait before the next hit would be allowed. 0 when allowed. */
  retryAfterMs: number;
}

export interface RateLimiterOptions {
  /** Minimum spacing between two allowed hits for the same key. 0 disables this guard. */
  minIntervalMs: number;
  /** Sliding-window length for the per-window cap. */
  windowMs: number;
  /** Maximum allowed hits within windowMs. */
  maxPerWindow: number;
  /** Injectable clock; defaults to Date.now. Tests pass a controllable function. */
  now?: () => number;
}

export interface RateLimiter {
  /** Checks the key and, when allowed, records the hit. Returns the decision. */
  check(key: string): RateLimitDecision;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { minIntervalMs, windowMs, maxPerWindow } = options;
  const now = options.now ?? Date.now;
  // key -> ascending timestamps of allowed hits still within the window
  const hits = new Map<string, number[]>();

  return {
    check(key: string): RateLimitDecision {
      const t = now();
      // Prune anything that has aged out of the window (fresh array — no mutation of shared state).
      const recent = (hits.get(key) ?? []).filter((ts) => t - ts < windowMs);

      // Anti-burst: too soon after the previous allowed hit.
      if (minIntervalMs > 0 && recent.length > 0) {
        const sinceLast = t - recent[recent.length - 1];
        if (sinceLast < minIntervalMs) {
          hits.set(key, recent);
          return { allowed: false, retryAfterMs: minIntervalMs - sinceLast };
        }
      }

      // Quota: window is full.
      if (recent.length >= maxPerWindow) {
        hits.set(key, recent);
        return { allowed: false, retryAfterMs: Math.max(windowMs - (t - recent[0]), 0) };
      }

      hits.set(key, [...recent, t]);
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}
