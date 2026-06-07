import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env';
import { migrate } from './db/migrate';
import { closePool } from './db/pool';
import { attachAuth } from './auth/middleware';
import { authRouter } from './auth/routes';
import { channelsRouter } from './routes/channels';
import { contentRouter } from './routes/content';
import { progressRouter } from './routes/progress';
import { startRefreshWorker, stopRefreshWorker } from './worker/refresh';

async function main(): Promise<void> {
  // Apply the schema on boot (idempotent) so a fresh container is ready to serve.
  await migrate();

  const app = express();
  app.set('trust proxy', 1); // behind nginx / load balancer
  app.use(helmet());
  if (env.CORS_ORIGIN) {
    app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
  }
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(attachAuth);

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
  app.use('/api/auth', authRouter);
  app.use('/api/channels', channelsRouter);
  app.use('/api', contentRouter); // /api/channels/:id/uploads, /api/playlists/:id, /api/videos/:id/meta
  app.use('/api/progress', progressRouter);

  // Unknown API route.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  const server = app.listen(env.PORT, () => console.log(`[server] listening on :${env.PORT} (${env.NODE_ENV})`));
  startRefreshWorker();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[server] ${signal} received, shutting down`);
    stopRefreshWorker();
    server.close();
    await closePool().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('[server] failed to start', e);
  process.exit(1);
});
