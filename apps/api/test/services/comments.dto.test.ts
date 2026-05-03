import { describe, expect, it } from 'vitest';

import { toCommentDto, type CommentRow } from '../../src/services/comments.js';

const AVATAR_URL = 'https://example.supabase.co/storage/v1/object/public/avatars/x.webp';

const base: CommentRow = {
  id: '018f0000-0000-7000-8000-000000000001',
  post_id: '018f0000-0000-7000-8000-0000000000aa',
  author_id: '018f0000-0000-7000-8000-00000000beef',
  author_display_name: 'Alice',
  author_avatar_url: AVATAR_URL,
  participant_id: '018f0000-0000-7000-8000-00000000cafe',
  body: 'Praying',
  reaction_count: 0,
  is_hidden: false,
  flag_count: 0,
  created_at: new Date('2026-04-18T00:00:00Z'),
  updated_at: new Date('2026-04-18T00:00:00Z'),
};

describe('toCommentDto', () => {
  it('returns author fields for a non-anonymous post', () => {
    const dto = toCommentDto(
      base,
      { role: 'member' },
      {
        postAuthorId: '018f0000-0000-7000-8000-00000000aaaa',
        postIsAnonymous: false,
        callerId: base.participant_id,
      },
    );
    expect(dto?.author_id).toBe(base.author_id);
    expect(dto?.display_name).toBe('Alice');
    expect(dto?.avatar_url).toBe(AVATAR_URL);
    expect(dto?.is_anonymous_author).toBe(false);
  });

  it("masks the POST AUTHOR's identity in their own reply inside an anon-post thread", () => {
    // The test row represents the post author replying inside a thread.
    // row.author_id == postAuthorId; caller is the commenter (thread participant).
    const postAuthorId = base.author_id;
    const dto = toCommentDto(
      base,
      { role: 'member' },
      {
        postAuthorId,
        postIsAnonymous: true,
        callerId: base.participant_id, // the commenter — legitimate viewer of the thread
      },
    );
    expect(dto).not.toBeNull();
    expect(dto?.author_id).toBeNull();
    expect(dto?.display_name).toBeNull();
    expect(dto?.avatar_url).toBeNull();
    expect(dto?.is_anonymous_author).toBe(true);
  });

  it('does NOT mask a non-author commenter on an anon post when caller is the post author', () => {
    const postAuthorId = '018f0000-0000-7000-8000-00000000aaaa';
    const dto = toCommentDto(
      {
        ...base,
        author_id: '018f0000-0000-7000-8000-00000000cccc',
        author_display_name: 'Bob',
        author_avatar_url: null,
      },
      { role: 'member' },
      { postAuthorId, postIsAnonymous: true, callerId: postAuthorId },
    );
    expect(dto?.author_id).toBe('018f0000-0000-7000-8000-00000000cccc');
    expect(dto?.display_name).toBe('Bob');
    expect(dto?.avatar_url).toBeNull();
    expect(dto?.is_anonymous_author).toBe(false);
  });

  it('returns null (not visible) for a non-participant member', () => {
    const dto = toCommentDto(
      base,
      { role: 'member' },
      {
        postAuthorId: '018f0000-0000-7000-8000-00000000aaaa',
        postIsAnonymous: false,
        callerId: '018f0000-0000-7000-8000-000000001111',
      },
    );
    expect(dto).toBeNull();
  });

  it('returns the row for a moderator regardless', () => {
    const dto = toCommentDto(
      base,
      { role: 'moderator' },
      {
        postAuthorId: '018f0000-0000-7000-8000-00000000aaaa',
        postIsAnonymous: false,
        callerId: '018f0000-0000-7000-8000-000000001111',
      },
    );
    expect(dto).not.toBeNull();
  });

  it('super_user sees real author even in an anon-author self-reply', () => {
    const postAuthorId = base.author_id;
    const dto = toCommentDto(
      base,
      { role: 'super_user' },
      {
        postAuthorId,
        postIsAnonymous: true,
        callerId: '018f0000-0000-7000-8000-000000009999',
      },
    );
    expect(dto?.author_id).toBe(base.author_id);
    expect(dto?.display_name).toBe('Alice');
    expect(dto?.avatar_url).toBe(AVATAR_URL);
    expect(dto?.is_anonymous_author).toBe(false);
  });

  it('hidden comments appear as tombstones to non-moderator, non-author callers who can see the thread', () => {
    const hidden = { ...base, is_hidden: true };
    // Caller is the participant (visible thread) but NOT the comment author → tombstone
    const asCommenter = toCommentDto(
      hidden,
      { role: 'member' },
      {
        postAuthorId: '018f0000-0000-7000-8000-00000000aaaa',
        postIsAnonymous: false,
        callerId: base.participant_id,
      },
    );
    expect(asCommenter).not.toBeNull();
    expect(asCommenter?.is_tombstone).toBe(true);
    expect(asCommenter?.body).toBe('');
    expect(asCommenter?.author_id).toBeNull();
    expect(asCommenter?.display_name).toBeNull();
    expect(asCommenter?.avatar_url).toBeNull();
    const asMod = toCommentDto(
      hidden,
      { role: 'moderator' },
      {
        postAuthorId: '018f0000-0000-7000-8000-00000000aaaa',
        postIsAnonymous: false,
        callerId: '018f0000-0000-7000-8000-000000001111',
      },
    );
    expect(asMod).not.toBeNull();
    expect(asMod?.is_tombstone).toBeFalsy();
  });
});
