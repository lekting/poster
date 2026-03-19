import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';

const logsDir = path.resolve(process.cwd(), 'logs');
fs.mkdirSync(logsDir, { recursive: true });

const transport = pino.transport({
  targets: [
    {
      target: 'pino-pretty',
      level: config.NODE_ENV === 'development' ? 'debug' : 'info',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    },
    {
      target: 'pino/file',
      level: 'debug',
      options: {
        destination: path.join(logsDir, 'app.log'),
        mkdir: true
      }
    }
  ]
});

export const logger = pino(
  {
    level: config.NODE_ENV === 'development' ? 'debug' : 'info',
    redact: {
      paths: [
        'token',
        'secret',
        'privateKey',
        'accessToken',
        'accessSecret',
        'encryptedTokens',
        'headers.authorization',
        'headers.Authorization'
      ],
      censor: '[REDACTED]'
    },
    timestamp: pino.stdTimeFunctions.isoTime
  },
  transport
);
