import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { FeedPost } from '../hooks/useFeed';

import { UpdatePostItem } from './UpdatePostItem';

const base: FeedPost = {
  id: 'u1',
  parent_id: 'p1',
  author_id: 'a1',
  display_name: 'Alice',
  avatar_url: null,
  status: 'published',
  is_anonymous: false,
  is_answered_prayer: false,
  body: 'short body',
  reaction_count: 0,
  prayer_count: 0,
  expires_at: null,
  edit_deadline: new Date().toISOString(),
  created_at: new Date().toISOString(),
  pinned_at: null,
  pinned_by: null,
  prayed: false,
  reactions: {},
  is_own_post: false,
  hidden_by: null,
  hidden_source: null,
  is_former_member: false,
  updates: [],
};

describe('UpdatePostItem', () => {
  it('renders the full body when truncateThreshold is not set', () => {
    const longBody = 'x'.repeat(500);
    render(<UpdatePostItem update={{ ...base, body: longBody }} embedded />);
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
    expect(screen.getByText(longBody)).toBeInTheDocument();
  });

  it('truncates body and shows "Show more" when threshold is set and body exceeds it', async () => {
    const user = userEvent.setup();
    const longBody = 'x'.repeat(500);
    render(
      <UpdatePostItem update={{ ...base, body: longBody }} embedded truncateThreshold={250} />,
    );
    const showMore = screen.getByRole('button', { name: /show more/i });
    expect(showMore).toBeInTheDocument();
    expect(screen.getByText(/x{250}…/)).toBeInTheDocument();
    await user.click(showMore);
    expect(screen.getByText(longBody)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });

  it('does not truncate when body is shorter than threshold', () => {
    render(
      <UpdatePostItem update={{ ...base, body: 'short body' }} embedded truncateThreshold={250} />,
    );
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });

  it('renders the gold wrapper around an answered update by default', () => {
    const { container } = render(
      <UpdatePostItem update={{ ...base, is_answered_prayer: true }} embedded />,
    );
    const wrapper = container.querySelector('article');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.className).toContain('[var(--answered-border)]');
    expect(wrapper!.className).toContain('from-dawn-50');
  });

  it('drops the gold wrapper when suppressAnsweredWrapper is set, keeping the eyebrow', () => {
    const { container } = render(
      <UpdatePostItem
        update={{ ...base, is_answered_prayer: true }}
        embedded
        suppressAnsweredWrapper
      />,
    );
    const wrapper = container.querySelector('article');
    expect(wrapper).not.toBeNull();
    // Wrapper uses the neutral border + background — no gold styling.
    expect(wrapper!.className).not.toContain('[var(--answered-border)]');
    expect(wrapper!.className).not.toContain('from-dawn-50');
    expect(wrapper!.className).toContain('[var(--border-soft)]');
    // The eyebrow itself still renders as the "Answered" textual marker.
    expect(screen.getByText('Answered')).toBeInTheDocument();
  });
});
