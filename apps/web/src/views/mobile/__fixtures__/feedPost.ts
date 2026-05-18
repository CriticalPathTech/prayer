import type { FeedPost } from '../../../hooks/useFeed';

let counter = 1;

export function makeFeedPost(over: Partial<FeedPost> = {}): FeedPost {
  const id = over.id ?? `018f0000-0000-7000-8000-${String(counter++).padStart(12, '0')}`;
  return {
    id,
    parent_id: null,
    author_id: 'author-1',
    display_name: 'Mary',
    avatar_url: null,
    status: 'published',
    is_anonymous: false,
    is_answered_prayer: false,
    body: 'Please pray.',
    reaction_count: 0,
    prayer_count: 0,
    expires_at: null,
    edit_deadline: new Date(Date.now() + 3600_000).toISOString(),
    created_at: new Date().toISOString(),
    prayed: false,
    reactions: {},
    is_own_post: false,
    hidden_by: null,
    hidden_source: null,
    is_former_member: false,
    updates: [],
    ...over,
  };
}
