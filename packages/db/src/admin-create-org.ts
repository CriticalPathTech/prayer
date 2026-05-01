import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { findOrCreateOrg } from './bootstrap.js';
import { createDb, type Db } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

// Same DNS-label regex used by the env-parameterized M1 migration. Keep them
// in sync — both paths produce slugs that become subdomains of prays.online.
const DNS_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface CreateOrgResult {
  id: string;
  created: boolean;
}

export async function createOrgFromCli(db: Db, slug: string): Promise<CreateOrgResult> {
  if (!DNS_LABEL_RE.test(slug)) {
    throw new Error(
      `admin:create-org: "${slug}" is not a valid DNS label ` +
        `(1-63 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen).`,
    );
  }
  // findOrCreateOrg uses slug for both the slug and display_name — display_name
  // is mutable later via a future super-user UI; M4 doesn't take a --name arg.
  return findOrCreateOrg(db, slug, slug);
}

function parseSlug(argv: string[]): string {
  const idx = argv.indexOf('--slug');
  if (idx === -1 || idx + 1 >= argv.length) {
    throw new Error('Usage: pnpm admin:create-org --slug <slug>');
  }
  const slug = argv[idx + 1];
  if (!slug) throw new Error('Usage: pnpm admin:create-org --slug <slug>');
  return slug;
}

// Reuse the same local-URL guard that bootstrap.ts uses. Re-export rather than
// duplicate so a future tightening (e.g., new local hostname) only touches one
// file.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
function assertLocalUrl(label: string, raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`admin:create-org: ${label} is not a valid URL: ${raw}`);
  }
  if (process.env.BOOTSTRAP_ALLOW_REMOTE === '1') return;
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `admin:create-org refuses non-local ${label}: ${url.hostname}\n` +
        `  Allowed hostnames: ${[...LOCAL_HOSTS].join(', ')}\n` +
        `  Re-run with BOOTSTRAP_ALLOW_REMOTE=1 to provision against a remote cell.`,
    );
  }
}

if (process.argv[1] === __filename) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('admin:create-org must not run in production');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (process.env.BOOTSTRAP_ALLOW_REMOTE === '1') {
    const dbHost = new URL(databaseUrl).hostname;
    console.warn(`admin:create-org: BOOTSTRAP_ALLOW_REMOTE=1 — provisioning remote tenant`);
    console.warn(`  DATABASE_URL host: ${dbHost}`);
  }
  assertLocalUrl('DATABASE_URL', databaseUrl);

  const slug = parseSlug(process.argv.slice(2));
  const db = createDb(databaseUrl);
  createOrgFromCli(db, slug)
    .then((result) => {
      if (result.created) {
        console.log(`Created org "${slug}" with id ${result.id}`);
      } else {
        console.log(`Org "${slug}" already exists (id ${result.id}) — nothing to do`);
      }
    })
    .catch((err) => {
      console.error(err.message ?? err);
      process.exit(1);
    })
    .finally(() => db.destroy());
}
