import { useMemo, type JSX } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

import { EngagementSummary } from '../components/EngagementSummary';
import { ModFollowupSearch } from '../components/ModFollowupSearch';
import { ModTabs } from '../components/ModTabs';
import { PostCard } from '../components/PostCard';
import { useAuth } from '../hooks/useAuth';
import { useModFollowup } from '../hooks/useModFollowup';
import { EMPTY_DRAFT, type FollowupDraft } from '../lib/mod-followup-pills';
import { parseApplied, serializeApplied } from '../lib/mod-followup-url';
import { isPrivilegedRole } from '../lib/roles';

export function ModFollowupPage(): JSX.Element {
  const { me } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialApplied = useMemo(() => parseApplied(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps
  const followup = useModFollowup({ initial: initialApplied });

  const onSearch = (draft: FollowupDraft): void => {
    setSearchParams(serializeApplied(draft));
    followup.applyAndSearch(draft);
  };

  if (!me) return <div>Loading…</div>;
  if (!isPrivilegedRole(me.role)) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-feed space-y-3">
      <ModTabs />
      <ModFollowupSearch initial={initialApplied ?? EMPTY_DRAFT} onSearch={onSearch} />

      {followup.loading ? (
        <p className="py-4 text-center text-sm text-[var(--fg-3)]">Loading…</p>
      ) : null}
      {followup.error ? <p className="text-sm text-ember-600">{followup.error}</p> : null}

      {followup.searched && !followup.loading && followup.items.length === 0 ? (
        <p className="py-16 text-center text-[var(--fg-3)]">
          No prayer requests match these filters. Try a different combination.
        </p>
      ) : null}

      <ul className="space-y-3">
        {followup.items.map((post) => (
          <li key={post.id}>
            {followup.applied ? (
              <EngagementSummary
                createdAt={post.created_at}
                appliedFilters={followup.applied.filters}
              />
            ) : null}
            <PostCard post={post} onChange={() => void followup.refresh()} />
          </li>
        ))}
      </ul>

      {followup.nextCursor ? (
        <button
          type="button"
          onClick={() => void followup.loadMore()}
          className="block w-full rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] py-2 text-sm text-[var(--fg-2)]"
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}
