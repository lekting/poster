import { Context, SessionFlavor } from 'grammy';
import { AppServices } from '../services/index.js';
import { BotSession } from './session.js';

export type AppContext = Context &
  SessionFlavor<BotSession> & {
    services: AppServices;
    authUserId: string | null;
  };
