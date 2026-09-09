import type { NextFunction, Request, Response } from 'express';

type RateBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateBucket>();

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * 进程内的 AI 请求限流。CloudBase 多实例场景建议再配合网关/WAF 限流；
 * 此处至少避免单实例被匿名或异常客户端持续占用模型额度。
 */
export function aiRateLimit(req: Request, res: Response, next: NextFunction) {
  const isProduction = process.env.NODE_ENV === 'production';
  const windowMs = positiveInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 60_000);
  const maxRequests = positiveInt(process.env.AI_RATE_LIMIT_MAX, isProduction ? 20 : 60);
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : existing;

  if (bucket.count >= maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'AI 请求过于频繁，请稍后再试', code: 'AI_RATE_LIMITED' });
    return;
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  res.setHeader('X-RateLimit-Limit', String(maxRequests));
  res.setHeader('X-RateLimit-Remaining', String(maxRequests - bucket.count));
  next();
}
