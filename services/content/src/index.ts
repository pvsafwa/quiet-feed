import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env';
import { attachAuth } from './auth/middleware';
import { channelsRouter } from './routes/channels';
import { contentRouter } from './routes/content';
import { connect } from 'amqplib';

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

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now(), service: 'content' }));
  app.use('/api/channels', channelsRouter);
  app.use('/api', contentRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  const server = app.listen(env.PORT, () => console.log(`[content-service] listening on :${env.PORT}`));

  // Setup RabbitMQ consumer
  let mqConn: any = null;
  try {
    mqConn = await connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    console.log('[content-service] Connected to RabbitMQ');
    const ch = await mqConn.createChannel();
    await ch.assertQueue('youtube_updates');
    ch.consume('youtube_updates', (msg: any) => {
      if (msg) {
        console.log(`[content-service] Received update: ${msg.content.toString()}`);
        // Handle cache invalidation or DB updates here...
        ch.ack(msg);
      }
    });
  } catch (err) {
    console.error('[content-service] RabbitMQ connection failed', err);
  }

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[content-service] ${signal} received, shutting down`);
    server.close();
    if (mqConn) await mqConn.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('[content-service] failed to start', e);
  process.exit(1);
});
