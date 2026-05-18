import type { RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';

import { TooManyRequestsError } from './error.js';

export interface LimiterScope {
  windowMs: number;
  max: number;
  /** 'ip' keys by the client IP; 'user' keys by the authenticated user id. */
  keyBy: 'ip' | 'user';
}

export function buildLimiter(scope: LimiterScope): RequestHandler {
  // ipKeyGenerator must appear literally inside the keyGenerator function body —
  // express-rate-limit v8 validates by `keyGenerator.toString().includes("ipKeyGenerator")`,
  // so wrapping through a helper trips ERR_ERL_KEY_GEN_IPV6 at startup. Wrapping
  // groups IPv6 callers by /64 instead of /128 (avoids per-address bypass).
  const opts: Partial<Options> = {
    windowMs: scope.windowMs,
    max: scope.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new TooManyRequestsError()),
    keyGenerator:
      scope.keyBy === 'user'
        ? (req) => req.user?.id ?? (req.ip ? ipKeyGenerator(req.ip) : 'anonymous')
        : (req) => (req.ip ? ipKeyGenerator(req.ip) : 'anonymous'),
  };
  return rateLimit(opts);
}

export const PREVIEW_SCOPE: LimiterScope = { windowMs: 60_000, max: 30, keyBy: 'ip' };
export const ACCEPT_SCOPE: LimiterScope = { windowMs: 15 * 60_000, max: 10, keyBy: 'ip' };
export const WRITE_SCOPE: LimiterScope = { windowMs: 60_000, max: 60, keyBy: 'user' };
export const REACTION_SCOPE: LimiterScope = { windowMs: 60_000, max: 120, keyBy: 'user' };
export const GLOBAL_SCOPE: LimiterScope = { windowMs: 60_000, max: 200, keyBy: 'ip' };
