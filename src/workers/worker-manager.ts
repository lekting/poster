import { config } from '../config/index.js';
import { AppServices } from '../services/index.js';
import { AccountRegistrationWorker } from './account-registration-worker.js';
import { DailyOrganicPostWorker } from './daily-organic-post-worker.js';
import { PostDistributionWorker } from './post-distribution-worker.js';

export class WorkerManager {
  private readonly postWorker: PostDistributionWorker;
  private readonly regWorker: AccountRegistrationWorker;
  private readonly organicWorker: DailyOrganicPostWorker;

  constructor(services: AppServices) {
    this.postWorker = new PostDistributionWorker(
      services,
      config.POST_WORKER_INTERVAL_MS
    );
    this.regWorker = new AccountRegistrationWorker(
      services,
      config.REG_WORKER_INTERVAL_MS
    );
    this.organicWorker = new DailyOrganicPostWorker(
      services,
      config.ORGANIC_POST_CHECK_INTERVAL_MS,
      config.ORGANIC_POST_MIN_AGE_MS
    );
  }

  start(): void {
    this.postWorker.start();
    this.regWorker.start();
    this.organicWorker.start();
  }

  stop(): void {
    this.postWorker.stop();
    this.regWorker.stop();
    this.organicWorker.stop();
  }
}
