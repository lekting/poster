import 'reflect-metadata';
import path from 'path';
import { DataSource } from 'typeorm';
import { config } from '../config/index.js';
import {
  AdMaterialEntity,
  AdPostEntity,
  CampaignEntity,
  CategoryEntity,
  OAuthPendingEntity,
  PersonaEntity,
  PlatformAccountEntity,
  RegistrationQueueEntity,
  TelegramUserEntity
} from './entities/index.js';
import { Init1700000000000 } from './migrations/1700000000000-init.js';
import { RegistrationQueue1700000001000 } from './migrations/1700000001000-registration-queue.js';
import { CampaignTargetCategories1700000002000 } from './migrations/1700000002000-campaign-target-categories.js';
import { OrganicPostTracking1700000003000 } from './migrations/1700000003000-organic-post-tracking.js';
import { OAuthPending1700000004000 } from './migrations/1700000004000-oauth-pending.js';

const dbPath = path.resolve(process.cwd(), config.DATABASE_PATH);

export const appDataSource = new DataSource({
  type: 'better-sqlite3',
  database: dbPath,
  entities: [
    OAuthPendingEntity,
    TelegramUserEntity,
    PersonaEntity,
    CategoryEntity,
    PlatformAccountEntity,
    CampaignEntity,
    AdMaterialEntity,
    AdPostEntity,
    RegistrationQueueEntity
  ],
  migrations: [Init1700000000000, RegistrationQueue1700000001000, CampaignTargetCategories1700000002000, OrganicPostTracking1700000003000, OAuthPending1700000004000],
  logging: false,
  synchronize: false
});
