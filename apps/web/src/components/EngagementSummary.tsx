import type { JSX } from 'react';

import type { FollowupFilters } from '../lib/mod-followup-pills';

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

interface Props {
  createdAt: string;
  appliedFilters: FollowupFilters;
}

export function EngagementSummary({ createdAt, appliedFilters }: Props): JSX.Element {
  const parts: string[] = [`Posted ${relativeTime(createdAt)}`];
  if (appliedFilters.noPrayers) parts.push('0 prayers');
  if (appliedFilters.noReactions) parts.push('0 reactions');
  if (appliedFilters.noComments) parts.push('0 comments');
  if (appliedFilters.noUpdates) parts.push('no updates');
  if (appliedFilters.noModResponse) parts.push('no leadership reply');
  return <p className="text-xs text-[var(--fg-3)]">{parts.join(' · ')}</p>;
}
