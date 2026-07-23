import IORedis, { Redis } from 'ioredis';

let connection: Redis | null = null;

/**
 * BullMQ requires maxRetriesPerRequest: null on the shared connection —
 * otherwise it throws at startup ("Your redis options maxRetriesPerRequest
 * must be null").
 */
export function getRedisConnection(): Redis {
  if (connection) return connection;

  const url = process.env.REDIS_URL;
  connection = url
    ? new IORedis(url, { maxRetriesPerRequest: null })
    : new IORedis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
      });

  connection.on('error', (err) => {
    console.error('[Redis] connection error:', err.message);
  });

  return connection;
}

export async function closeRedisConnection(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
