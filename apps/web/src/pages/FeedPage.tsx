import type { JSX } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { FilterTabs } from '../components/FilterTabs';
import { NewActivityBanner } from '../components/NewActivityBanner';
import { PostCard } from '../components/PostCard';
import { Icon } from '../components/ui/Icon';
import { useFeed } from '../hooks/useFeed';
import { useFeedSnapshot } from '../hooks/useFeedSnapshot';

export function FeedPage(): JSX.Element {
  const { posts, filter, setFilter, loading, error, hasMore, loadMore, snapshotId, refresh } =
    useFeed();
  const [hasNew, setHasNew] = useState(false);

  useFeedSnapshot({
    currentSnapshotId: snapshotId,
    onNew: () => setHasNew(true),
    filter,
  });

  async function onRefreshClick(): Promise<void> {
    setHasNew(false);
    await refresh();
  }

  const empty = posts.length === 0 && !loading && !error;

  return (
    <div className="mx-auto max-w-feed px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-serif text-[28px] font-semibold tracking-[-0.02em] text-[var(--fg-1)]">
          Prayer Requests
        </h1>
        <Link
          to="/compose"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-vesper-500 px-4 text-sm font-medium text-white shadow-warm-sm transition-colors hover:bg-vesper-600 focus:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <Icon name="plus" size={16} />
          New request
        </Link>
      </div>
      <FilterTabs value={filter} onChange={setFilter} />
      <NewActivityBanner
        visible={hasNew && filter === 'all'}
        onRefresh={() => void onRefreshClick()}
      />
      {error ? <p className="mb-4 text-sm text-ember-600">{error}</p> : null}
      {empty ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <Icon name="pray" size={32} className="opacity-[0.12] scale-[2]" />
          <p className="font-serif text-[18px] text-[var(--fg-3)]">Nothing on the wall yet.</p>
        </div>
      ) : null}
      <ul className="space-y-0">
        {posts.map((p) => (
          <li key={p.id}>
            <PostCard post={p} onChange={() => void refresh()} />
          </li>
        ))}
      </ul>
      {loading ? <p className="py-4 text-center text-sm text-[var(--fg-3)]">Loading…</p> : null}
      {hasMore ? (
        <button
          onClick={() => void loadMore()}
          className="mx-auto mt-4 inline-flex h-9 items-center rounded-md border border-[var(--border-default)] bg-white px-4 text-sm font-medium text-[var(--fg-2)] hover:bg-parchment-100 transition-colors"
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}
