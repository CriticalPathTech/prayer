// packages/db/migrations/0024_post_status_pending_rejected.cjs
//
// ALTER TYPE ADD VALUE cannot run inside a transaction block (Postgres restriction).
// Using a .cjs migration so we can call pgm.noTransaction() before executing the DDL.

exports.up = (pgm) => {
  pgm.noTransaction();
  pgm.sql(`ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'pending'`);
  pgm.sql(`ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'rejected'`);
};

exports.down = (_pgm) => {
  // Postgres has no DROP VALUE for enum types.
  // Down migration intentionally left as no-op; 'pending' and 'rejected' stay on the type.
};
