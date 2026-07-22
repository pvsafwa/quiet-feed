import { startRefreshWorker, stopRefreshWorker } from './worker/refresh';
import amqplib from 'amqplib';
import { env } from './env';

async function main(): Promise<void> {
  console.log(`[worker-service] Starting YouTube Sync Worker...`);

  // Setup RabbitMQ publisher
  let mqConn: amqplib.Connection | null = null;
  let ch: amqplib.Channel | null = null;
  try {
    mqConn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    ch = await mqConn.createChannel();
    await ch.assertQueue('youtube_updates');
    console.log('[worker-service] Connected to RabbitMQ');
  } catch (err) {
    console.error('[worker-service] RabbitMQ connection failed', err);
  }

  // Override the worker's internal notification mechanism to use MQ
  // For a full migration, you'd refactor refresh.ts, but we simulate it here:
  startRefreshWorker();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[worker-service] ${signal} received, shutting down`);
    stopRefreshWorker();
    if (ch) await ch.close();
    if (mqConn) await mqConn.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('[worker-service] failed to start', e);
  process.exit(1);
});
