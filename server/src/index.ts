import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth';
import { itineraryRouter } from './routes/itineraries';
import { aiRouter } from './routes/ai';

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(
  cors({
    origin: true,
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

app.listen(port, () => {
  console.log(`Atlas API listening on http://localhost:${port}`);
});
