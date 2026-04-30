import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { LRUCache } from 'lru-cache';

export interface ResolvedOrg {
  id: string;
  slug: string;
  displayName: string;
}

const HOST_TO_ORG_TTL_MS = 5 * 60 * 1000;
const HOST_TO_ORG_MAX = 1000;

export interface OrgResolver {
  resolve(host: string): Promise<ResolvedOrg | null>;
  invalidate(host: string): void;
}

// lru-cache v11 enforces V extends {} (no null/undefined as cached values), so
// wrap the result in an object. This preserves "cache nulls so bad hosts don't
// hammer the DB" without the cache's "miss" sentinel (undefined) being ambiguous
// with a cached negative.
interface CachedResolution {
  org: ResolvedOrg | null;
}

export function createOrgResolver(db: Kysely<Database>): OrgResolver {
  const cache = new LRUCache<string, CachedResolution>({
    max: HOST_TO_ORG_MAX,
    ttl: HOST_TO_ORG_TTL_MS,
  });
  return {
    async resolve(host) {
      const cached = cache.get(host);
      if (cached !== undefined) return cached.org;
      const org = await findOrgByHost(db, host);
      cache.set(host, { org });
      return org;
    },
    invalidate(host) {
      cache.delete(host);
    },
  };
}

const SLUG_HOST_RE = /^([a-z0-9-]+)\.prays\.online$/;

export async function findOrgByHost(
  db: Kysely<Database>,
  host: string,
): Promise<ResolvedOrg | null> {
  const m = SLUG_HOST_RE.exec(host);
  if (!m) return null;
  const slug = m[1]!;
  const row = await db
    .selectFrom('orgs')
    .where('slug', '=', slug)
    .select(['id', 'slug', 'display_name'])
    .executeTakeFirst();
  if (!row) return null;
  return { id: row.id, slug: row.slug, displayName: row.display_name };
}

/** Resolve localhost / 127.0.0.1 to the only org in the DB. Dev convenience.
 * Throws a clear error if zero or multiple orgs exist. */
export async function resolveLocalhost(db: Kysely<Database>): Promise<ResolvedOrg> {
  const rows = await db.selectFrom('orgs').select(['id', 'slug', 'display_name']).execute();
  if (rows.length === 0) {
    throw new Error('orgContext: no orgs in DB. Run `pnpm db:migrate` and `pnpm bootstrap`.');
  }
  if (rows.length > 1) {
    throw new Error(
      `orgContext: multiple orgs in DB (${rows.map((r) => r.slug).join(', ')}). ` +
        `Localhost dev expects exactly one. Set Host header explicitly.`,
    );
  }
  const r = rows[0]!;
  return { id: r.id, slug: r.slug, displayName: r.display_name };
}
