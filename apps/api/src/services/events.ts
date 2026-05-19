import type { Database, UserRole } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Emoji } from '@prayer/shared';
import type { Kysely, Transaction } from 'kysely';

export type PostEventKind =
  | 'post.update_created'
  | 'post.submitted'
  | 'post.approved'
  | 'post.rejected'
  | 'post.pinned'
  | 'post.unpinned';

export type CommentEventKind = 'comment.created';

export type ReactionEventKind = 'reaction.added' | 'reaction.removed';
export type PrayerEventKind = 'prayer.added' | 'prayer.removed';

export type FlagEventKind = 'flag.created' | 'flag.resolved';
export type ModerationEventKind = 'moderator.hide' | 'moderator.unhide';

export type InvitationEventKind = 'invite.accepted' | 'invitation.redeemed';

export type AdminEventKind =
  | 'admin.member_removed'
  | 'admin.org_settings_updated'
  | 'admin.role_changed';

export type EventKind =
  | PostEventKind
  | CommentEventKind
  | ReactionEventKind
  | PrayerEventKind
  | FlagEventKind
  | ModerationEventKind
  | InvitationEventKind
  | AdminEventKind;

export type EventPayload = Record<string, unknown>;

export interface WriteEventInput {
  kind: EventKind;
  orgId: string;
  postId: string;
  actorId: string;
  payload: EventPayload;
}

/** Backwards-compatible alias — existing callers pass `kind: PostEventKind`. */
export async function writePostEvent(
  db: Kysely<Database> | Transaction<Database>,
  input: WriteEventInput,
): Promise<void> {
  await db
    .insertInto('events')
    .values({
      id: newId(),
      org_id: input.orgId,
      type: input.kind,
      post_id: input.postId,
      actor_id: input.actorId,
      payload: input.payload as never,
    })
    .execute();
}

/** Alias for clarity at comment call-sites; shares the same table. */
export const writeCommentEvent = writePostEvent;

export interface WriteReactionEventInput {
  kind: ReactionEventKind;
  orgId: string;
  postId: string;
  actorId: string;
  targetType: 'post' | 'comment';
  targetId: string;
  emoji: Emoji;
}

export async function writeReactionEvent(
  db: Kysely<Database> | Transaction<Database>,
  input: WriteReactionEventInput,
): Promise<void> {
  await db
    .insertInto('events')
    .values({
      id: newId(),
      org_id: input.orgId,
      type: input.kind,
      post_id: input.postId,
      actor_id: input.actorId,
      payload: {
        target_type: input.targetType,
        target_id: input.targetId,
        emoji: input.emoji,
      } as never,
    })
    .execute();
}

export interface WritePrayerEventInput {
  kind: PrayerEventKind;
  orgId: string;
  postId: string;
  actorId: string;
}

export async function writePrayerEvent(
  db: Kysely<Database> | Transaction<Database>,
  input: WritePrayerEventInput,
): Promise<void> {
  await db
    .insertInto('events')
    .values({
      id: newId(),
      org_id: input.orgId,
      type: input.kind,
      post_id: input.postId,
      actor_id: input.actorId,
      payload: { post_id: input.postId } as never,
    })
    .execute();
}

export interface WriteFlagEventInput {
  kind: FlagEventKind;
  orgId: string;
  postId: string;
  actorId: string;
  flagId: string;
  targetType: 'post' | 'comment';
  targetId: string;
  reason: string;
  note?: string;
}

export async function writeFlagEvent(
  db: Kysely<Database> | Transaction<Database>,
  input: WriteFlagEventInput,
): Promise<void> {
  await db
    .insertInto('events')
    .values({
      id: newId(),
      org_id: input.orgId,
      type: input.kind,
      post_id: input.postId,
      actor_id: input.actorId,
      payload: {
        flag_id: input.flagId,
        target_type: input.targetType,
        target_id: input.targetId,
        reason: input.reason,
        ...(input.note !== undefined ? { note: input.note } : {}),
      } as never,
    })
    .execute();
}

export interface WriteModerationEventInput {
  kind: ModerationEventKind;
  orgId: string;
  postId: string;
  actorId: string | null;
  targetType: 'post' | 'comment';
  targetId: string;
  source: 'auto' | 'manual';
  reason?: string;
}

export async function writeModerationEvent(
  db: Kysely<Database> | Transaction<Database>,
  input: WriteModerationEventInput,
): Promise<void> {
  await db
    .insertInto('events')
    .values({
      id: newId(),
      org_id: input.orgId,
      type: input.kind,
      post_id: input.postId,
      actor_id: input.actorId,
      payload: {
        target_type: input.targetType,
        target_id: input.targetId,
        source: input.source,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      } as never,
    })
    .execute();
}

export interface WriteInviteAcceptedEventInput {
  kind: 'invite.accepted';
  orgId: string;
  actorId: string;
  invitationId: string;
  inviteeId: string;
  inviteeDisplayName: string;
}

export interface WriteInvitationRedeemedEventInput {
  kind: 'invitation.redeemed';
  orgId: string;
  actorId: string;
  invitationId: string;
  invitorId: string;
  inviteeId: string;
  inviteCodeId: string;
  inviteeDisplayName: string;
}

export type WriteInvitationEventInput =
  | WriteInviteAcceptedEventInput
  | WriteInvitationRedeemedEventInput;

export async function writeInvitationEvent(
  db: Kysely<Database> | Transaction<Database>,
  input: WriteInvitationEventInput,
): Promise<void> {
  const payload =
    input.kind === 'invite.accepted'
      ? {
          invitation_id: input.invitationId,
          invitee_id: input.inviteeId,
          invitee_display_name: input.inviteeDisplayName,
        }
      : {
          invitation_id: input.invitationId,
          invitor_id: input.invitorId,
          invitee_id: input.inviteeId,
          invite_code_id: input.inviteCodeId,
          invitee_display_name: input.inviteeDisplayName,
        };
  await db
    .insertInto('events')
    .values({
      id: newId(),
      org_id: input.orgId,
      type: input.kind,
      post_id: null,
      actor_id: input.actorId,
      payload: payload as never,
    })
    .execute();
}

export interface WriteMemberRemovedEventInput {
  kind: 'admin.member_removed';
  orgId: string;
  actorId: string;
  targetUserId: string;
}

export interface WriteOrgSettingsUpdatedEventInput {
  kind: 'admin.org_settings_updated';
  orgId: string;
  actorId: string;
  before: { displayName: string };
  after: { displayName: string };
}

export interface WriteRoleChangedEventInput {
  kind: 'admin.role_changed';
  orgId: string;
  actorId: string;
  targetUserId: string;
  beforeRole: UserRole;
  afterRole: UserRole;
}

export type WriteAdminEventInput =
  | WriteMemberRemovedEventInput
  | WriteOrgSettingsUpdatedEventInput
  | WriteRoleChangedEventInput;

export async function writeAdminEvent(
  db: Kysely<Database> | Transaction<Database>,
  input: WriteAdminEventInput,
): Promise<void> {
  const payload =
    input.kind === 'admin.member_removed'
      ? { target_user_id: input.targetUserId }
      : input.kind === 'admin.role_changed'
        ? {
            target_user_id: input.targetUserId,
            before_role: input.beforeRole,
            after_role: input.afterRole,
          }
        : {
            before: { display_name: input.before.displayName },
            after: { display_name: input.after.displayName },
          };
  await db
    .insertInto('events')
    .values({
      id: newId(),
      org_id: input.orgId,
      type: input.kind,
      post_id: null,
      actor_id: input.actorId,
      payload: payload as never,
    })
    .execute();
}
