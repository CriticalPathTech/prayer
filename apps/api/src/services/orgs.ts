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
  /** Look up an org by its slug directly. Used by the X-Org-Slug header path
   * for mobile clients, which talk to a per-cell api hostname (no per-org
   * subdomain). Same caching contract as `resolve`, with a separate slug-keyed
   * LRU. */
  resolveBySlug(slug: string): Promise<ResolvedOrg | null>;
  invalidate(host: string): void;
  /** Drop every cached entry whose resolved org id matches `orgId`.
   * Use after writes that change the org row (e.g. PATCH /admin/church/settings):
   * one org can sit behind multiple cached hostnames (web `<slug>.prays.online`,
   * api `api.<slug>.prays.online`, custom domains, `localhost` in dev) AND a
   * slug-keyed entry from the X-Org-Slug header path, so we scan both caches.
   * Each is bounded by HOST_TO_ORG_MAX so the scan is O(<=2000); writes are rare. */
  invalidateByOrgId(orgId: string): void;
}

// lru-cache v11 enforces V extends {} (no null/undefined as cached values), so
// wrap the result in an object. This preserves "cache nulls so bad hosts don't
// hammer the DB" without the cache's "miss" sentinel (undefined) being ambiguous
// with a cached negative.
interface CachedResolution {
  org: ResolvedOrg | null;
}

export function createOrgResolver(db: Kysely<Database>): OrgResolver {
  const hostCache = new LRUCache<string, CachedResolution>({
    max: HOST_TO_ORG_MAX,
    ttl: HOST_TO_ORG_TTL_MS,
  });
  const slugCache = new LRUCache<string, CachedResolution>({
    max: HOST_TO_ORG_MAX,
    ttl: HOST_TO_ORG_TTL_MS,
  });
  return {
    async resolve(host) {
      const cached = hostCache.get(host);
      if (cached !== undefined) return cached.org;
      const org = await findOrgByHost(db, host);
      hostCache.set(host, { org });
      return org;
    },
    async resolveBySlug(slug) {
      const cached = slugCache.get(slug);
      if (cached !== undefined) return cached.org;
      const org = await findOrgBySlug(db, slug);
      slugCache.set(slug, { org });
      return org;
    },
    invalidate(host) {
      hostCache.delete(host);
    },
    invalidateByOrgId(orgId) {
      for (const [host, cached] of hostCache.entries()) {
        if (cached.org?.id === orgId) hostCache.delete(host);
      }
      for (const [slug, cached] of slugCache.entries()) {
        if (cached.org?.id === orgId) slugCache.delete(slug);
      }
    },
  };
}

/** A DNS label per RFC 1123: 1-63 chars, alphanumeric and hyphens, no
 * leading/trailing hyphen. Used to validate the slug we extract from the
 * leftmost subdomain before we send it to the DB. */
const DNS_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Pull the candidate org slug out of a hostname. Platform-agnostic — works
 * whether the deployment lives on `prays.online`, a self-hosted custom
 * domain, or anything else. The first label is the slug; if the first
 * label is `api` (the per-cell api endpoint pattern), use the second.
 *
 * Returns null for hostnames that can't carry a slug (bare hostnames,
 * IPs, malformed labels). The actual "is this a real org?" check is the
 * DB lookup downstream; we don't hardcode any platform domain here.
 */
function extractSlugFromHost(host: string): string | null {
  const labels = host.split('.');
  // Need at least 2 labels (`<slug>.<domain>`) to extract a slug. Bare
  // `localhost` / IPs are handled by `resolveLocalhost` upstream, not here.
  if (labels.length < 2) return null;
  const slug = labels[0] === 'api' ? labels[1] : labels[0];
  if (!slug || !DNS_LABEL_RE.test(slug)) return null;
  return slug;
}

export async function findOrgByHost(
  db: Kysely<Database>,
  host: string,
): Promise<ResolvedOrg | null> {
  const slug = extractSlugFromHost(host);
  if (!slug) return null;
  return findOrgBySlug(db, slug);
}

/** Look up an org by its slug. Used by the X-Org-Slug header path for mobile
 * clients (which talk to a per-cell api hostname with no per-org subdomain).
 * Validates the slug as a DNS label before hitting the DB so attacker-controlled
 * input can't cause arbitrary lookups. */
export async function findOrgBySlug(
  db: Kysely<Database>,
  slug: string,
): Promise<ResolvedOrg | null> {
  if (!DNS_LABEL_RE.test(slug)) return null;
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
