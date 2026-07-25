// Minimal in-memory sliding-window rate limiter for auth endpoints on a single Node.js
// process. It resets on redeploy/restart and doesn't share state across multiple instances,
// but it's enough to stop naive password-brute-force scripts against low-traffic endpoints
// like the admin login, which have no other throttling.
const attempts = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  const timestamps = (attempts.get(key) || []).filter((t) => t > windowStart);

  if (timestamps.length >= maxAttempts) {
    const retryAfterSeconds = Math.ceil((timestamps[0] + windowMs - now) / 1000);
    attempts.set(key, timestamps);
    return { allowed: false, retryAfterSeconds };
  }

  timestamps.push(now);
  attempts.set(key, timestamps);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function getRequestIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}
