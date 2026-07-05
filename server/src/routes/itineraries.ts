import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authRequired, AuthPayload } from '../middleware/auth';

export const itineraryRouter = Router();
itineraryRouter.use(authRequired);

itineraryRouter.get('/', async (req, res) => {
  const u = (req as { user?: AuthPayload }).user!;
  const list = await prisma.itinerary.findMany({
    where: { userId: u.userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, updatedAt: true, createdAt: true },
  });
  res.json({ items: list });
});

itineraryRouter.get('/:id', async (req, res) => {
  const u = (req as { user?: AuthPayload }).user!;
  const row = await prisma.itinerary.findFirst({
    where: { id: req.params.id, userId: u.userId },
  });
  if (!row) {
    res.status(404).json({ error: '未找到方案' });
    return;
  }
  res.json({
    id: row.id,
    name: row.name,
    payload: JSON.parse(row.payload),
    updatedAt: row.updatedAt,
  });
});

itineraryRouter.post('/', async (req, res) => {
  const u = (req as { user?: AuthPayload }).user!;
  const name = String(req.body?.name || '未命名方案').slice(0, 120);
  const payload = req.body?.payload;
  if (payload === undefined) {
    res.status(400).json({ error: '缺少 payload' });
    return;
  }
  const row = await prisma.itinerary.create({
    data: {
      userId: u.userId,
      name,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    },
  });
  res.json({ id: row.id, name: row.name });
});

itineraryRouter.put('/:id', async (req, res) => {
  const u = (req as { user?: AuthPayload }).user!;
  const name = req.body?.name != null ? String(req.body.name).slice(0, 120) : undefined;
  const payload = req.body?.payload;
  const existing = await prisma.itinerary.findFirst({
    where: { id: req.params.id, userId: u.userId },
  });
  if (!existing) {
    res.status(404).json({ error: '未找到方案' });
    return;
  }
  await prisma.itinerary.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(payload !== undefined
        ? { payload: typeof payload === 'string' ? payload : JSON.stringify(payload) }
        : {}),
    },
  });
  res.json({ ok: true });
});

itineraryRouter.delete('/:id', async (req, res) => {
  const u = (req as { user?: AuthPayload }).user!;
  const r = await prisma.itinerary.deleteMany({
    where: { id: req.params.id, userId: u.userId },
  });
  if (r.count === 0) {
    res.status(404).json({ error: '未找到方案' });
    return;
  }
  res.json({ ok: true });
});
