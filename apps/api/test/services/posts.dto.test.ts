import { describe, expect, it } from 'vitest';

import { type PostRow, toPostDto } from '../../src/services/posts.js';

const AVATAR_URL = 'https://example.supabase.co/storage/v1/object/public/avatars/x.webp';

const base: PostRow = {
  id: '018f0000-0000-7000-8000-000000000001',
  parent_id: null,
  author_id: '018f0000-0000-7000-8000-000000000002',
  author_display_name: 'Alice',
  author_avatar_url: AVATAR_URL,
  status: 'published' as const,
  is_anonymous: false,
  is_answered_prayer: false,
  body: 'Please pray',
  reaction_count: 0,
  prayer_count: 0,
  expires_at: new Date('2026-05-18T00:00:00Z'),
  edit_deadline: new Date('2026-04-18T01:00:00Z'),
  created_at: new Date('2026-04-18T00:00:00Z'),
  pinned_at: null,
  pinned_by_id: null,
  pinned_by_display_name: null,
};

describe('toPostDto', () => {
  it('returns author fields when not anonymous', () => {
    const dto = toPostDto(base, { role: 'member' });
    expect(dto.author_id).toBe(base.author_id);
    expect(dto.display_name).toBe('Alice');
    expect(dto.avatar_url).toBe(AVATAR_URL);
    expect(dto.is_anonymous).toBe(false);
  });

  it('masks author for member when anonymous', () => {
    const dto = toPostDto({ ...base, is_anonymous: true }, { role: 'member' });
    expect(dto.author_id).toBeNull();
    expect(dto.display_name).toBeNull();
    expect(dto.avatar_url).toBeNull();
    expect(dto.is_anonymous).toBe(true);
  });

  it('masks author for moderator when anonymous', () => {
    const dto = toPostDto({ ...base, is_anonymous: true }, { role: 'moderator' });
    expect(dto.author_id).toBeNull();
    expect(dto.display_name).toBeNull();
    expect(dto.avatar_url).toBeNull();
  });

  it('reveals author for super_user when anonymous', () => {
    const dto = toPostDto({ ...base, is_anonymous: true }, { role: 'super_user' });
    expect(dto.author_id).toBe(base.author_id);
    expect(dto.display_name).toBe('Alice');
    expect(dto.avatar_url).toBe(AVATAR_URL);
    expect(dto.is_anonymous).toBe(true);
  });

  it('is_former_member=false when memberSet is omitted', () => {
    const dto = toPostDto(base, { role: 'member' });
    expect(dto.is_former_member).toBe(false);
  });

  it('is_former_member=false when author is in the member set', () => {
    const dto = toPostDto(base, { role: 'member' }, undefined, new Set([base.author_id]));
    expect(dto.is_former_member).toBe(false);
  });

  it('is_former_member=true when author is NOT in the member set', () => {
    const dto = toPostDto(base, { role: 'member' }, undefined, new Set(['someone-else']));
    expect(dto.is_former_member).toBe(true);
  });

  it('anonymous post by former member: is_anonymous mask wins for display, but is_former_member is still true', () => {
    const dto = toPostDto(
      { ...base, is_anonymous: true },
      { role: 'member' },
      undefined,
      new Set(),
    );
    expect(dto.is_anonymous).toBe(true);
    expect(dto.is_former_member).toBe(true);
    // Anonymity mask still applies — display_name and author_id are redacted
    expect(dto.display_name).toBeNull();
    expect(dto.author_id).toBeNull();
  });
});

describe('toPostDto pin fields', () => {
  const baseRow: PostRow = {
    id: '01900000-0000-7000-8000-000000000001',
    parent_id: null,
    author_id: 'author-1',
    author_display_name: 'Alice',
    author_avatar_url: null,
    status: 'published',
    is_anonymous: false,
    is_answered_prayer: false,
    body: 'pray',
    reaction_count: 0,
    prayer_count: 0,
    expires_at: null,
    edit_deadline: new Date('2030-01-01T00:00:00Z'),
    created_at: new Date('2026-01-01T00:00:00Z'),
    pinned_at: null,
    pinned_by_id: null,
    pinned_by_display_name: null,
  };

  it('returns pinned_at + pinned_by: null when row is not pinned', () => {
    const dto = toPostDto(baseRow, { role: 'member' });
    expect(dto.pinned_at).toBeNull();
    expect(dto.pinned_by).toBeNull();
  });

  it('returns pinned_at as ISO and pinned_by as { id, display_name } when row is pinned', () => {
    const pinnedAt = new Date('2026-05-01T12:00:00Z');
    const dto = toPostDto(
      {
        ...baseRow,
        pinned_at: pinnedAt,
        pinned_by_id: 'mod-1',
        pinned_by_display_name: 'Pastor Jon',
      },
      { role: 'member' },
    );
    expect(dto.pinned_at).toBe(pinnedAt.toISOString());
    expect(dto.pinned_by).toEqual({ id: 'mod-1', display_name: 'Pastor Jon' });
  });

  it('keeps pin fields visible on anonymous posts to non-super_user (pinner identity is intentional)', () => {
    const pinnedAt = new Date('2026-05-01T12:00:00Z');
    const dto = toPostDto(
      {
        ...baseRow,
        is_anonymous: true,
        pinned_at: pinnedAt,
        pinned_by_id: 'mod-1',
        pinned_by_display_name: 'Pastor Jon',
      },
      { role: 'member' },
    );
    expect(dto.author_id).toBeNull();
    expect(dto.pinned_at).toBe(pinnedAt.toISOString());
    expect(dto.pinned_by).toEqual({ id: 'mod-1', display_name: 'Pastor Jon' });
  });
});
