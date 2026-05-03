import pino from 'pino';

export function createLogger(level: string): pino.Logger {
  return pino({
    level,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
  });
}
