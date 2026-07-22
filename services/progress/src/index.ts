import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env';
import { attachAuth } from './auth/middleware';
import { progressRouter } from './routes/progress';

async function main(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  if (env.CORS_ORIGIN) {
    app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
  }
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(attachAuth);

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now(), service: 'progress' }));
  app.use('/api/progress', progressRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  const server = app.listen(env.PORT, () => console.log(`[progress-service] listening on :${env.PORT}`));

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[progress-service] ${signal} received, shutting down`);
    server.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('[progress-service] failed to start', e);
  process.exit(1);
});
