import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './ratelimit.js';

// A controllable clock so time is deterministic — never depends on real timers.
function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('createRateLimiter', () => {
  it('allows hits up to the window cap, then blocks', () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ minIntervalMs: 0, windowMs: 60_000, maxPerWindow: 3, now: clock.now });

    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);

    const blocked = limiter.check('k');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('refills as old hits age out of the window', () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ minIntervalMs: 0, windowMs: 1_000, maxPerWindow: 2, now: clock.now });

    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(false);

    // Once the window fully elapses, the earliest hits age out and the key refills.
    clock.advance(1_000);
    expect(limiter.check('k').allowed).toBe(true);
  });

  it('enforces the minimum interval between consecutive hits and reports retryAfterMs', () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ minIntervalMs: 2_000, windowMs: 60_000, maxPerWindow: 100, now: clock.now });

    expect(limiter.check('k').allowed).toBe(true);

    clock.advance(500);
    const tooSoon = limiter.check('k');
    expect(tooSoon.allowed).toBe(false);
    expect(tooSoon.retryAfterMs).toBe(1_500);

    clock.advance(1_500);
    expect(limiter.check('k').allowed).toBe(true);
  });

  it('tracks each key independently', () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ minIntervalMs: 0, windowMs: 60_000, maxPerWindow: 1, now: clock.now });

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    // A different key has its own budget.
    expect(limiter.check('b').allowed).toBe(true);
  });

  it('defaults to Date.now when no clock is injected', () => {
    const limiter = createRateLimiter({ minIntervalMs: 0, windowMs: 60_000, maxPerWindow: 1 });
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(false);
  });
});
