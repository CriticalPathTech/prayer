import type { Database } from '@prayer/db';
import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';

import type { JwtVerifier } from '../lib/jwt.js';

import { ForbiddenError, UnauthorizedError } from './error.js';

export interface AuthDependencies {
  db: Kysely<Database>;
  jwtVerifier: JwtVerifier;
}

export function sanitizeDisplayName(email: string): string {
  return (email ?? '')
    .split('@')[0]!
    .trim()
    .replace(/[^\w\s\-'.]/g, '')
    .slice(0, 60)
    .trim();
}

/** Verify JWT; attach req.supabase. Does NOT touch users. */
export function requireSession(deps: Pick<AuthDependencies, 'jwtVerifier'>): RequestHandler {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing bearer token');
      }
      const token = header.slice('Bearer '.length).trim();
      if (!token) throw new UnauthorizedError('Empty bearer token');

      let claims: Awaited<ReturnType<JwtVerifier['verify']>>;
      try {
        claims = await deps.jwtVerifier.verify(token);
      } catch {
        throw new UnauthorizedError('Invalid token');
      }

      if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
        throw new UnauthorizedError('Missing sub claim');
      }
      if (typeof claims.email !== 'string' || claims.email.length === 0) {
        throw new UnauthorizedError('Missing email claim');
      }

      req.supabase = { auth_id: claims.sub, email: claims.email };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** requireSession + users row must exist with an active org membership. */
export function requireAuth(deps: AuthDependencies): RequestHandler {
  const session = requireSession(deps);
  return (req, res, next) => {
    session(req, res, async (err) => {
      if (err) return next(err);
      try {
        const row = await deps.db
          .selectFrom('users as u')
          .innerJoin('user_orgs as uo', 'uo.user_id', 'u.id')
          .select([
            'u.id',
            'u.supabase_auth_id',
            'u.email',
            'u.display_name',
            'u.avatar_url',
            'uo.org_id',
            'uo.role',
          ])
          .where('u.supabase_auth_id', '=', req.supabase!.auth_id)
          .where('uo.org_id', '=', req.org!.id)
          .executeTakeFirst();
        if (!row) throw new ForbiddenError('Not a member of this org');
        req.user = {
          id: row.id,
          supabaseAuthId: row.supabase_auth_id,
          email: row.email,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
          role: row.role,
          orgId: row.org_id,
        };
        next();
      } catch (e) {
        next(e);
      }
    });
  };
}

export function requireMember(): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!['member', 'moderator', 'super_user'].includes(req.user.role)) {
      return next(new ForbiddenError());
    }
    next();
  };
}

export function requireModerator(): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!['moderator', 'super_user'].includes(req.user.role)) {
      return next(new ForbiddenError());
    }
    next();
  };
}

export function requireSuperUser(): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (req.user.role !== 'super_user') return next(new ForbiddenError());
    next();
  };
}
