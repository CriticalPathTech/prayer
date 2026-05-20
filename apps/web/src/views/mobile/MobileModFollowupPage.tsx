import { useMemo, type JSX } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

import { EngagementSummary } from '../../components/EngagementSummary';
import { ModFollowupSearch } from '../../components/ModFollowupSearch';
import { useAuth } from '../../hooks/useAuth';
import { useModFollowup } from '../../hooks/useModFollowup';
import { EMPTY_DRAFT, type FollowupDraft } from '../../lib/mod-followup-pills';
import { parseApplied, serializeApplied } from '../../lib/mod-followup-url';
import { isPrivilegedRole } from '../../lib/roles';

import { MobilePageHeader } from './MobilePageHeader';
import { MobilePostCard } from './MobilePostCard';

export function MobileModFollowupPage(): JSX.Element {
  const { me } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialApplied = useMemo(() => parseApplied(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps
  const followup = useModFollowup({ initial: initialApplied });

  const onSearch = (draft: FollowupDraft): void => {
    setSearchParams(serializeApplied(draft));
    followup.applyAndSearch(draft);
  };

  if (!me) {
    return (
      <>
        <MobilePageHeader variant={{ kind: 'back', title: 'Follow-up' }} />
        <div className="px-4 py-16 text-center text-sm text-[var(--fg-3)]">Loading…</div>
      </>
    );
  }
  if (!isPrivilegedRole(me.role)) return <Navigate to="/" replace />;

  return (
    <>
      <MobilePageHeader variant={{ kind: 'back', title: 'Follow-up' }} />
      <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-3">
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

        {followup.items.map((post) => (
          <div key={post.id} className="flex flex-col gap-2">
            {followup.applied ? (
              <EngagementSummary
                createdAt={post.created_at}
                appliedFilters={followup.applied.filters}
              />
            ) : null}
            <MobilePostCard post={post} onChange={() => void followup.refresh()} />
          </div>
        ))}

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
    </>
  );
}
