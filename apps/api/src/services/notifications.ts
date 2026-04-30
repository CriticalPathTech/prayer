import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';

import { NotFoundError, ValidationError } from '../middleware/error.js';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface ListNotificationsArgs {
  orgId: string;
  callerId: string;
  unread?: boolean;
  cursor?: string;
  limit: number;
}

export interface ListNotificationsResult {
  items: NotificationRow[];
  next_cursor: string | null;
  unread_count: number;
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(token: string): string {
  try {
    return Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    throw new ValidationError('Invalid cursor');
  }
}

export async function listNotifications(
  db: Kysely<Database>,
  args: ListNotificationsArgs,
): Promise<ListNotificationsResult> {
  let q = db
    .selectFrom('notifications')
    .select(['id', 'user_id', 'type', 'payload', 'read_at', 'created_at'])
    .where('org_id', '=', args.orgId)
    .where('user_id', '=', args.callerId)
    .orderBy('id', 'desc')
    .limit(args.limit + 1);

  if (args.unread) q = q.where('read_at', 'is', null);
  if (args.cursor) {
    const cursorId = decodeCursor(args.cursor);
    q = q.where('id', '<', cursorId);
  }

  const rows = await q.execute();
  const hasMore = rows.length > args.limit;
  const page = hasMore ? rows.slice(0, args.limit) : rows;

  const unreadCountRow = await db
    .selectFrom('notifications')
    .select((eb) => eb.fn.count<number>('id').as('count'))
    .where('org_id', '=', args.orgId)
    .where('user_id', '=', args.callerId)
    .where('read_at', 'is', null)
    .executeTakeFirstOrThrow();

  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.id) : null;

  return {
    items: page.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      payload: r.payload as Record<string, unknown>,
      read_at: r.read_at ? (r.read_at as unknown as Date).toISOString() : null,
      created_at: (r.created_at as unknown as Date).toISOString(),
    })),
    next_cursor: nextCursor,
    unread_count: Number(unreadCountRow.count),
  };
}

export interface MarkReadArgs {
  orgId: string;
  callerId: string;
  id: string;
}

export interface MarkReadResult {
  id: string;
  read_at: string;
}

export async function markNotificationRead(
  db: Kysely<Database>,
  args: MarkReadArgs,
): Promise<MarkReadResult> {
  const updated = await db
    .updateTable('notifications')
    .set({ read_at: new Date() })
    .where('org_id', '=', args.orgId)
    .where('id', '=', args.id)
    .where('user_id', '=', args.callerId)
    .where('read_at', 'is', null)
    .returning(['id', 'read_at'])
    .executeTakeFirst();
  if (updated) {
    return {
      id: updated.id,
      read_at: (updated.read_at as unknown as Date).toISOString(),
    };
  }
  const existing = await db
    .selectFrom('notifications')
    .select(['id', 'read_at'])
    .where('org_id', '=', args.orgId)
    .where('id', '=', args.id)
    .where('user_id', '=', args.callerId)
    .executeTakeFirst();
  if (!existing || existing.read_at === null) {
    throw new NotFoundError('Notification not found');
  }
  return {
    id: existing.id,
    read_at: (existing.read_at as unknown as Date).toISOString(),
  };
}

export interface MarkAllReadArgs {
  orgId: string;
  callerId: string;
}

export interface MarkAllReadResult {
  updated: number;
}

export async function markAllNotificationsRead(
  db: Kysely<Database>,
  args: MarkAllReadArgs,
): Promise<MarkAllReadResult> {
  const rows = await db
    .updateTable('notifications')
    .set({ read_at: new Date() })
    .where('org_id', '=', args.orgId)
    .where('user_id', '=', args.callerId)
    .where('read_at', 'is', null)
    .returning('id')
    .execute();
  return { updated: rows.length };
}
