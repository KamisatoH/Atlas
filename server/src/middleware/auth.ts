import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  email: string;
}

const secret = process.env.JWT_SECRET || 'dev-secret';

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
