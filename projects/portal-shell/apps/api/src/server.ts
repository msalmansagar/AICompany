import { loadConfig } from './config.js';
import { buildApp } from './app.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Entry point — loads config, builds Fastify app, starts listening.
 *
 * Graceful shutdown handles SIGTERM (Docker stop) and SIGINT (Ctrl+C).
 */
async function start(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp(config);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Received shutdown signal — closing server');
    try {
      await app.close();
      app.log.info('Server closed gracefully');
      process.exit(0);
    } catch (error) {
      app.log.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('uncaughtException', (error) => {
    app.log.fatal({ error }, 'Uncaught exception — shutting down');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    app.log.fatal({ reason }, 'Unhandled promise rejection — shutting down');
    process.exit(1);
  });

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(
    { port: config.PORT, env: config.NODE_ENV },
    'Portal API is listening',
  );
}

void start();
