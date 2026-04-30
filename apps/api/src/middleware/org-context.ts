import type { Database } from '@prayer/db';
import type { Request, RequestHandler } from 'express';
import type { Kysely } from 'kysely';

import type { OrgResolver } from '../services/orgs.js';
import { resolveLocalhost } from '../services/orgs.js';

import { NotFoundError } from './error.js';

export interface OrgContextDeps {
  db: Kysely<Database>;
  resolver: OrgResolver;
}

export function orgContext(deps: OrgContextDeps): RequestHandler {
  return async (req, _res, next) => {
    try {
      const host = pickHost(req);
      let org = null;
      if (host === 'localhost' || host === '127.0.0.1') {
        org = await resolveLocalhost(deps.db);
      } else {
        org = await deps.resolver.resolve(host);
      }
      if (!org) {
        throw new NotFoundError('Unknown host');
      }
      req.org = org;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Pick the host that org-routing should match against.
 *
 * Browsers send `Origin` on cross-origin XHR — when the web frontend lives at
 * one host (the customer-facing URL) and calls the api at a different host
 * (e.g. an api.<slug> subdomain or a hosting-provider default). The CORS
 * middleware already validates Origin against `CORS_ORIGIN`, so trusting it
 * for org resolution is safe — an attacker can't fake an Origin the operator
 * hasn't allowlisted. For same-origin or server-to-server requests Origin
 * isn't sent; we fall back to `req.hostname`, which Express derives from
 * X-Forwarded-Host given trust proxy = 2.
 */
function pickHost(req: Request): string {
  const origin = req.get('origin');
  if (origin) {
    try {
      return new URL(origin).hostname;
    } catch {
      // Malformed Origin → fall through to req.hostname.
    }
  }
  return req.hostname;
}
