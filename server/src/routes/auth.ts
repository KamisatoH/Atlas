import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken, authRequired, AuthPayload } from '../middleware/auth';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password || password.length < 6) {
    res.status(400).json({ error: '邮箱与密码无效（密码至少6位）' });
    return;
  }
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    res.status(409).json({ error: '该邮箱已注册' });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  const token = signToken({ userId: user.id, email: user.email });
  res.json({ token, user: { id: user.id, email: user.email } });
});

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: '邮箱或密码错误' });
    return;
  }
  const token = signToken({ userId: user.id, email: user.email });
  res.json({ token, user: { id: user.id, email: user.email } });
});

authRouter.get('/me', authRequired, async (req, res) => {
  const u = (req as { user?: AuthPayload }).user!;
  const user = await prisma.user.findUnique({
    where: { id: u.userId },
    select: { id: true, email: true },
  });
  res.json({ user });
});
