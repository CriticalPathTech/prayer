import type { ColumnType, Generated } from 'kysely';

export type UserRole = 'member' | 'moderator' | 'super_user';
export type PostStatus = 'draft' | 'published' | 'archived' | 'hidden' | 'pending' | 'rejected';
export type ReactionTargetType = 'post' | 'comment';
export type LogoFillMode = 'original' | 'adaptive' | 'custom';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface OrgsTable {
  id: string;
  slug: string;
  display_name: string;
  status: Generated<string>;
  requires_post_approval: Generated<boolean>;
  logo_svg: string | null;
  logo_fill_mode: LogoFillMode | null;
  logo_color: string | null;
  logo_updated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: Generated<Timestamp>;
}

export interface UserOrgsTable {
  user_id: string;
  org_id: string;
  role: Generated<UserRole>;
  joined_at: Generated<Timestamp>;
}

export interface UsersTable {
  id: string;
  supabase_auth_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: Generated<Timestamp>;
}

export interface PostsTable {
  id: string;
  org_id: string;
  parent_id: string | null;
  author_id: string;
  status: Generated<PostStatus>;
  is_anonymous: Generated<boolean>;
  is_answered_prayer: Generated<boolean>;
  body: string;
  reaction_count: Generated<number>;
  prayer_count: Generated<number>;
  flag_count: Generated<number>;
  expires_at: Date | null;
  edit_deadline: Date;
  moderation_note: string | null;
  moderated_by: string | null;
  moderated_at: Date | null;
  created_at: Generated<Timestamp>;
  pinned_at: Date | null;
  pin_until: Date | null;
  pinned_by: string | null;
  extended_at: Date | null;
  extended_by: string | null;
}

export interface CommentsTable {
  id: string;
  org_id: string;
  post_id: string;
  author_id: string;
  participant_id: string;
  body: string;
  reaction_count: Generated<number>;
  is_hidden: Generated<boolean>;
  flag_count: Generated<number>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ReactionsTable {
  id: string;
  org_id: string;
  target_type: ReactionTargetType;
  target_id: string;
  author_id: string;
  emoji: string;
  created_at: Generated<Timestamp>;
}

export interface PrayersTable {
  id: string;
  org_id: string;
  post_id: string;
  user_id: string;
  created_at: Generated<Timestamp>;
}

export interface FlagsTable {
  id: string;
  org_id: string;
  target_type: ReactionTargetType;
  target_id: string;
  flagger_id: string;
  reason: string;
  note: string | null;
  resolved_at: Date | null;
  resolved_by_id: string | null;
  created_at: Generated<Timestamp>;
}

export interface InvitationsTable {
  id: string;
  org_id: string;
  invite_code_id: string;
  invitor_id: string;
  invitee_id: string;
  created_at: Generated<Timestamp>;
}

export interface InviteCodesTable {
  id: string;
  org_id: string;
  owner_id: string;
  code: string;
  seat_cap: number;
  seats_remaining: number;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
}

export interface EventsTable {
  id: string;
  org_id: string;
  type: string;
  post_id: string | null;
  actor_id: string | null;
  payload: unknown;
  processed_at: Date | null;
  created_at: Generated<Timestamp>;
}

export interface NotificationsTable {
  id: string;
  org_id: string;
  user_id: string;
  type: string;
  payload: unknown;
  read_at: Date | null;
  created_at: Generated<Timestamp>;
}

export interface ModPostSkipsTable {
  post_id: string;
  moderator_id: string;
  org_id: string;
  skipped_at: Generated<Timestamp>;
}

export interface Database {
  orgs: OrgsTable;
  user_orgs: UserOrgsTable;
  users: UsersTable;
  posts: PostsTable;
  comments: CommentsTable;
  reactions: ReactionsTable;
  prayers: PrayersTable;
  flags: FlagsTable;
  invitations: InvitationsTable;
  invite_codes: InviteCodesTable;
  events: EventsTable;
  notifications: NotificationsTable;
  mod_post_skips: ModPostSkipsTable;
}
