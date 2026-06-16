import type { FeedPost } from '../hooks/useFeed';

import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) throw new Error('VITE_API_URL must be set');

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    if (detail !== undefined) {
      this.detail = detail;
    }
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const errBody = (body as ApiErrorBody | null)?.error;
    const { code, message, ...rest } = (errBody ?? {}) as {
      code?: string;
      message?: string;
      [k: string]: unknown;
    };
    const detail = Object.keys(rest).length > 0 ? (rest as Record<string, unknown>) : undefined;
    throw new ApiError(res.status, code ?? 'UNKNOWN', message ?? res.statusText, detail);
  }
  return body as T;
}

export type LogoFillMode = 'original' | 'adaptive' | 'custom';

export interface OrgLogo {
  svg: string;
  fillMode: LogoFillMode;
  color: string | null;
}

export interface OrgBranding {
  slug: string;
  displayName: string;
  logo: OrgLogo | null;
}

export async function fetchOrgBranding(): Promise<OrgBranding> {
  return apiFetch<OrgBranding>('/org');
}

export interface LogoPreviewResult {
  sanitizedSvg: string;
  warnings: { strippedTags: string[]; multiColor: boolean };
  detectedColors: string[];
}

export async function previewChurchLogo(svg: string): Promise<LogoPreviewResult> {
  return apiFetch<LogoPreviewResult>('/admin/church/logo/preview', {
    method: 'POST',
    body: JSON.stringify({ svg }),
  });
}

export async function saveChurchLogo(input: {
  svg: string;
  fillMode: LogoFillMode;
  color?: string;
}): Promise<{ logo: OrgLogo }> {
  return apiFetch<{ logo: OrgLogo }>('/admin/church/logo', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function removeChurchLogo(): Promise<void> {
  await apiFetch<null>('/admin/church/logo', { method: 'DELETE' });
}

export type InviteCodePreview =
  | { status: 'valid'; invitor_display_name: string; seat_cap: number; seats_remaining: number }
  | { status: 'full'; invitor_display_name: string; seat_cap: number }
  | { status: 'inactive'; invitor_display_name: string; seat_cap: number }
  | { status: 'not_found' };

export async function previewInviteCode(code: string): Promise<InviteCodePreview> {
  return apiFetch<InviteCodePreview>(`/invite-codes/${encodeURIComponent(code)}`);
}

export interface RedeemResult {
  user: { id: string; display_name: string; email: string; role: string };
}

export async function redeemInviteCode(code: string): Promise<RedeemResult> {
  return apiFetch<RedeemResult>('/invitations/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export interface MyInvitesCodeRow {
  id: string;
  code: string;
  seat_cap: number;
  seats_remaining: number;
  is_active: boolean;
  created_at: string;
  redemptions: Array<{ invitee_id: string; invitee_display_name: string; redeemed_at: string }>;
}

export interface MyInvitesResponse {
  active: MyInvitesCodeRow[];
  retired: MyInvitesCodeRow[];
}

export async function fetchMyInvites(): Promise<MyInvitesResponse> {
  return apiFetch<MyInvitesResponse>('/me/invites');
}

export interface ModUserSearchResult {
  id: string;
  display_name: string;
  email: string;
}

export async function searchUsersMod(q: string): Promise<ModUserSearchResult[]> {
  return apiFetch<ModUserSearchResult[]>(`/mod/users/search?q=${encodeURIComponent(q)}`);
}

export async function listInviteCodesMod(ownerId: string): Promise<MyInvitesCodeRow[]> {
  return apiFetch<MyInvitesCodeRow[]>(`/mod/invite-codes?owner_id=${encodeURIComponent(ownerId)}`);
}

export interface GrantInviteCodeResult {
  id: string;
  code: string;
  seat_cap: number;
  seats_remaining: number;
  is_active: boolean;
  created_at: string;
}

export async function grantInviteCodeMod(
  ownerId: string,
  seatCap: number,
): Promise<GrantInviteCodeResult> {
  return apiFetch<GrantInviteCodeResult>('/mod/invite-codes', {
    method: 'POST',
    body: JSON.stringify({ owner_id: ownerId, seat_cap: seatCap }),
  });
}

export async function retireInviteCodeMod(id: string): Promise<{ is_active: false }> {
  return apiFetch<{ is_active: false }>(`/mod/invite-codes/${encodeURIComponent(id)}/retire`, {
    method: 'POST',
  });
}

export interface MeDto {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: 'member' | 'moderator' | 'super_user';
}

export async function updateMyProfile(input: { display_name: string }): Promise<MeDto> {
  return apiFetch<MeDto>('/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function uploadMyAvatar(imageDataUrl: string): Promise<MeDto> {
  return apiFetch<MeDto>('/me/avatar', {
    method: 'POST',
    body: JSON.stringify({ image_data: imageDataUrl }),
  });
}

export async function deleteMyAvatar(): Promise<MeDto> {
  return apiFetch<MeDto>('/me/avatar', { method: 'DELETE' });
}

export interface DraftInput {
  body: string;
  expires_at?: string;
  is_anonymous?: boolean;
}

export async function getMyDraft(): Promise<{ draft: FeedPost | null }> {
  return apiFetch<{ draft: FeedPost | null }>('/me/draft');
}

export async function saveMyDraft(input: DraftInput): Promise<{ draft: FeedPost }> {
  return apiFetch<{ draft: FeedPost }>('/me/draft', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export interface PublishMyDraftInput {
  pin_duration_days?: 1 | 3 | 7 | 14 | 30;
}

export async function publishMyDraft(input: PublishMyDraftInput = {}): Promise<{ post: FeedPost }> {
  return apiFetch<{ post: FeedPost }>('/me/draft/publish', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function pinPost(
  postId: string,
  durationDays: 1 | 3 | 7 | 14 | 30,
): Promise<{ post: FeedPost }> {
  return apiFetch<{ post: FeedPost }>(`/mod/posts/${postId}/pin`, {
    method: 'POST',
    body: JSON.stringify({ duration_days: durationDays }),
  });
}

export async function unpinPost(postId: string): Promise<{ post: FeedPost }> {
  return apiFetch<{ post: FeedPost }>(`/mod/posts/${postId}/unpin`, { method: 'POST' });
}

// ——— Mod approvals ——————————————————————————————————————————————————

export interface ApprovalItem extends FeedPost {
  skipped_by_me: boolean;
}

export async function listApprovals(): Promise<{ items: ApprovalItem[] }> {
  return apiFetch<{ items: ApprovalItem[] }>('/mod/approvals?limit=50');
}

export async function approvePost(id: string): Promise<{ post: FeedPost }> {
  return apiFetch<{ post: FeedPost }>(`/mod/posts/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
  });
}

export async function rejectPost(id: string, note?: string): Promise<{ post: FeedPost }> {
  return apiFetch<{ post: FeedPost }>(`/mod/posts/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify(note !== undefined && note !== '' ? { note } : {}),
  });
}

export async function skipPost(id: string): Promise<void> {
  await apiFetch<null>(`/mod/posts/${encodeURIComponent(id)}/skip`, { method: 'POST' });
}

export async function unskipPost(id: string): Promise<void> {
  await apiFetch<null>(`/mod/posts/${encodeURIComponent(id)}/skip`, { method: 'DELETE' });
}

export interface FollowupFilters {
  noPrayers: boolean;
  noReactions: boolean;
  noComments: boolean;
  noUpdates: boolean;
  noModResponse: boolean;
}

export interface FollowupQuery {
  filters: FollowupFilters;
  minAge: { value: number; unit: 'hours' | 'days' };
  sort?: 'oldest' | 'newest';
  cursor?: string;
}

export interface FollowupResponse {
  items: FeedPost[];
  next_cursor: string | null;
}

export async function getFollowupPosts(q: FollowupQuery): Promise<FollowupResponse> {
  const params = new URLSearchParams();
  if (q.filters.noPrayers) params.set('no_prayers', 'true');
  if (q.filters.noReactions) params.set('no_reactions', 'true');
  if (q.filters.noComments) params.set('no_comments', 'true');
  if (q.filters.noUpdates) params.set('no_updates', 'true');
  if (q.filters.noModResponse) params.set('no_mod_response', 'true');
  if (q.minAge.value > 0) {
    params.set('min_age_value', String(q.minAge.value));
    params.set('min_age_unit', q.minAge.unit);
  }
  if (q.sort && q.sort !== 'oldest') params.set('sort', q.sort);
  if (q.cursor) params.set('cursor', q.cursor);
  const qs = params.toString();
  return apiFetch<FollowupResponse>(`/mod/follow-up${qs ? `?${qs}` : ''}`);
}
