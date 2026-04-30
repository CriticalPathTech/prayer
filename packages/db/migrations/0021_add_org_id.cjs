// packages/db/migrations/0021_add_org_id.js
//
// Env-parameterized migration:
//   MIGRATION_DEFAULT_ORG_SLUG (default: 'hope')
//   MIGRATION_DEFAULT_ORG_NAME (default: 'Hope')
//
// Operator workflow:
//   - Local dev (fresh): defaults apply → 'hope' org
//   - Staging cell: MIGRATION_DEFAULT_ORG_SLUG=staging MIGRATION_DEFAULT_ORG_NAME=Staging pnpm db:migrate
//   - Lakeside production (Spec #4): MIGRATION_DEFAULT_ORG_SLUG=lakeside MIGRATION_DEFAULT_ORG_NAME=Lakeside pnpm db:migrate

const { uuidv7 } = require('uuidv7');

exports.up = async (pgm) => {
  const slug = process.env.MIGRATION_DEFAULT_ORG_SLUG ?? 'hope';
  const name = process.env.MIGRATION_DEFAULT_ORG_NAME ?? 'Hope';
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    throw new Error(
      `MIGRATION_DEFAULT_ORG_SLUG must be a valid DNS label (1-63 chars, ` +
        `alphanumeric + hyphens, no leading/trailing hyphen), got: ${slug}`,
    );
  }

  await pgm.db.query('BEGIN');
  try {
    const orgId = uuidv7();

    // Step 1: seed the default org (idempotent on slug)
    await pgm.db.query(
      `INSERT INTO orgs (id, slug, display_name) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO NOTHING`,
      [orgId, slug, name],
    );
    // Read back the id (in case the row already existed with a different uuid)
    const { rows } = await pgm.db.query(`SELECT id FROM orgs WHERE slug = $1`, [slug]);
    if (rows.length === 0) {
      throw new Error(`bug: orgs row with slug=${slug} not found after upsert`);
    }
    const defaultOrgId = rows[0].id;

    // Step 2: backfill user_orgs from users.role
    // CRITICAL: copy users.role exactly. Do NOT use the 'member' default — that
    // would silently demote every existing moderator and super_user.
    await pgm.db.query(
      `INSERT INTO user_orgs (user_id, org_id, role)
       SELECT u.id, $1, u.role FROM users u
       ON CONFLICT (user_id, org_id) DO NOTHING`,
      [defaultOrgId],
    );

    // Step 3: add org_id NOT NULL to every tenant-scoped table
    // FK uses ON DELETE RESTRICT (not CASCADE): org deletion requires explicit purge of
    // dependent data first. Prevents a stray DELETE FROM orgs from wiping a tenant's content.
    const tables = [
      'posts',
      'comments',
      'reactions',
      'prayers',
      'flags',
      'invitations',
      'invite_codes',
      'events',
      'notifications',
    ];
    for (const t of tables) {
      await pgm.db.query(`ALTER TABLE ${t} ADD COLUMN org_id UUID NULL`);
      await pgm.db.query(`UPDATE ${t} SET org_id = $1`, [defaultOrgId]);
      await pgm.db.query(`ALTER TABLE ${t} ALTER COLUMN org_id SET NOT NULL`);
      await pgm.db.query(
        `ALTER TABLE ${t} ADD CONSTRAINT ${t}_org_id_fkey
         FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT`,
      );
    }

    // Step 4: composite indexes for common access patterns
    await pgm.db.query(
      `CREATE INDEX idx_posts_org_created ON posts (org_id, created_at DESC)
       WHERE parent_id IS NULL AND status = 'published'`,
    );
    await pgm.db.query(`CREATE INDEX idx_comments_org_post ON comments (org_id, post_id)`);
    await pgm.db.query(
      `CREATE INDEX idx_reactions_org_target ON reactions (org_id, target_type, target_id)`,
    );
    await pgm.db.query(`CREATE INDEX idx_prayers_org_post ON prayers (org_id, post_id)`);
    await pgm.db.query(
      `CREATE INDEX idx_flags_org_target ON flags (org_id, target_type, target_id)`,
    );
    await pgm.db.query(
      `CREATE INDEX idx_invitations_org_invitor ON invitations (org_id, invitor_id)`,
    );
    await pgm.db.query(
      `CREATE INDEX idx_events_org_pending ON events (org_id, id) WHERE processed_at IS NULL`,
    );
    await pgm.db.query(
      `CREATE INDEX idx_notifications_org_user_unread ON notifications (org_id, user_id, read_at)`,
    );

    // Step 5: invite_codes uniqueness moves from global to per-org
    await pgm.db.query(`ALTER TABLE invite_codes DROP CONSTRAINT IF EXISTS invite_codes_code_key`);
    await pgm.db.query(
      `CREATE UNIQUE INDEX idx_invite_codes_org_code ON invite_codes (org_id, code)`,
    );

    await pgm.db.query('COMMIT');
  } catch (err) {
    await pgm.db.query('ROLLBACK');
    throw err;
  }
};

exports.down = async (pgm) => {
  await pgm.db.query('BEGIN');
  try {
    // Restore invite_codes global UNIQUE on code
    await pgm.db.query(`DROP INDEX IF EXISTS idx_invite_codes_org_code`);
    await pgm.db.query(
      `ALTER TABLE invite_codes ADD CONSTRAINT invite_codes_code_key UNIQUE (code)`,
    );

    // Drop indexes
    const indexes = [
      'idx_notifications_org_user_unread',
      'idx_events_org_pending',
      'idx_invitations_org_invitor',
      'idx_flags_org_target',
      'idx_prayers_org_post',
      'idx_reactions_org_target',
      'idx_comments_org_post',
      'idx_posts_org_created',
    ];
    for (const idx of indexes) {
      await pgm.db.query(`DROP INDEX IF EXISTS ${idx}`);
    }

    // Drop org_id columns + constraints
    const tables = [
      'notifications',
      'events',
      'invite_codes',
      'invitations',
      'flags',
      'prayers',
      'reactions',
      'comments',
      'posts',
    ];
    for (const t of tables) {
      await pgm.db.query(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS ${t}_org_id_fkey`);
      await pgm.db.query(`ALTER TABLE ${t} DROP COLUMN IF EXISTS org_id`);
    }

    // Note: we do NOT delete user_orgs rows or the default org row in down — that data is also
    // managed by 0020/0019 down migrations. Leaving it here would be redundant.

    await pgm.db.query('COMMIT');
  } catch (err) {
    await pgm.db.query('ROLLBACK');
    throw err;
  }
};
