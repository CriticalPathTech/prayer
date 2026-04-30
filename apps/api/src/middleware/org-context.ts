import type { Database } from '@prayer/db';
import type { RequestHandler } from 'express';
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
      const host = req.hostname;
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
