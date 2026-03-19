import 'reflect-metadata';
import { assertRuntimeConfig } from './config/index.js';
import { appDataSource } from './db/data-source.js';
import { buildServices } from './services/index.js';
import { logger } from './shared/logger.js';
import { TelegramBotApp } from './bot/bot.js';
import { WorkerManager } from './workers/worker-manager.js';

async function bootstrap(): Promise<void> {
  assertRuntimeConfig();

  await appDataSource.initialize();
  await appDataSource.runMigrations();

  const services = buildServices(appDataSource);
  const botApp = new TelegramBotApp(services);
  const workerManager = new WorkerManager(services);

  botApp.start();
  workerManager.start();

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down application');
    await botApp.stop();
    workerManager.stop();
    await appDataSource.destroy();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });

  process.once('SIGTERM', () => {
    void shutdown();
  });

  logger.info('Application started');
}

void bootstrap().catch((error: unknown) => {
  logger.error({ error }, 'Fatal bootstrap error');
  process.exit(1);
});
