// Fixed-window in-memory rate limiter. Adequate for a single-instance prototype; use a shared
// store (e.g. Redis) when running multiple instances.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  b.count++;
  if (b.count > limit) return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  return { allowed: true, retryAfterSec: 0 };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}
