import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';

import { NewActivityBanner } from '../../components/NewActivityBanner';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../hooks/useAuth';
import { useFeed, type FeedFilter } from '../../hooks/useFeed';
import { useFeedSnapshot } from '../../hooks/useFeedSnapshot';
import { useNotifications } from '../../hooks/useNotifications';
import { displayedOrgName } from '../../lib/org';

import type { MobileLayoutContext } from './MobileLayout';
import { MobilePageHeader } from './MobilePageHeader';
import { MobilePostCard } from './MobilePostCard';

function parseFilter(value: string | null): FeedFilter {
  return value === 'mine' || value === 'answered' ? value : 'all';
}

export function MobileFeedPage(): JSX.Element {
  const { openDrawer } = useOutletContext<MobileLayoutContext>();
  const [searchParams] = useSearchParams();
  const urlFilter = parseFilter(searchParams.get('filter'));
  const { posts, filter, setFilter, loading, error, hasMore, loadMore, snapshotId, refresh } =
    useFeed({ initialFilter: urlFilter });
  const notif = useNotifications();
  const { me } = useAuth();
  const [hasNew, setHasNew] = useState(false);
  // Mobile header has ~140px for the brand label; collapse long names to first word.
  const brandLabel = displayedOrgName(me?.orgDisplayName, 14);

  useEffect(() => {
    if (urlFilter !== filter) setFilter(urlFilter);
  }, [urlFilter, filter, setFilter]);

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
    <>
      <MobilePageHeader
        variant={{
          kind: 'feed',
          onMenu: openDrawer,
          unreadCount: notif.unreadCount,
          brandLabel,
        }}
      />
      <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-3">
        <NewActivityBanner
          visible={hasNew && filter === 'all'}
          onRefresh={() => void onRefreshClick()}
        />
        {error ? <p className="text-sm text-ember-600">{error}</p> : null}
        {empty ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Icon name="pray" size={32} className="opacity-[0.12] scale-[2]" />
            <p className="font-serif text-[18px] text-[var(--fg-3)]">Nothing on the wall yet.</p>
          </div>
        ) : null}
        {posts.map((p) => (
          <MobilePostCard key={p.id} post={p} onChange={() => void refresh()} />
        ))}
        {loading ? <p className="py-4 text-center text-sm text-[var(--fg-3)]">Loading…</p> : null}
        {hasMore ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="mx-auto mt-2 inline-flex h-9 items-center rounded-md border border-[var(--border-default)] bg-white px-4 text-sm font-medium text-[var(--fg-2)] active:bg-parchment-100"
          >
            Load more
          </button>
        ) : null}
      </div>
    </>
  );
}
