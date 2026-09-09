import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { authRouter } from './routes/auth';
import { itineraryRouter } from './routes/itineraries';
import { aiRouter } from './routes/ai';

const app = express();
const port = Number(process.env.PORT) || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// CloudBase 位于反向代理之后；启用后 req.ip 才能用于 AI 限流。
app.set('trust proxy', 1);

app.use(
  cors({
    // 生产环境默认同域，不返回 CORS 头；若确有跨域前端，再显式配置 CORS_ORIGIN。
    origin: corsOrigins.length ? corsOrigins : isProduction ? false : true,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/itineraries', itineraryRouter);
app.use('/api/ai', aiRouter);

// 生产环境（如 CloudBase 云托管）：托管前端构建产物，实现前后端同域访问。
// 默认路径相对 server 目录：../frontend/dist，可用 STATIC_DIR 覆盖。
const staticDir = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(process.cwd(), '../frontend/dist');

if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  // SPA 回退：非 /api 的 GET 请求一律返回 index.html，交给前端路由处理。
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Atlas API listening on http://localhost:${port}`);
});
