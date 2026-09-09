import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  email: string;
}

const configuredSecret = process.env.JWT_SECRET?.trim();

// 本地开发允许不配置密钥，方便启动；生产环境绝不能悄悄回退到公开默认值。
if (process.env.NODE_ENV === 'production' && !configuredSecret) {
  throw new Error('JWT_SECRET must be configured in production');
}

const secret = configuredSecret || 'dev-secret';

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, secret, { expiresIn: '14d' });
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: '未登录' });
    return;
  }
  try {
    const decoded = jwt.verify(token, secret) as AuthPayload;
    (req as Request & { user?: AuthPayload }).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
}
