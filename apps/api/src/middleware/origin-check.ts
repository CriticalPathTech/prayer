import type { RequestHandler } from 'express';

import { ForbiddenError } from './error.js';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function buildOriginCheck(allowed: string[]): RequestHandler {
  const allowSet = new Set(allowed);
  return (req, _res, next) => {
    if (!MUTATING_METHODS.has(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next();
    if (typeof origin === 'string' && allowSet.has(origin)) return next();
    return next(new ForbiddenError('Origin not allowed'));
  };
}
