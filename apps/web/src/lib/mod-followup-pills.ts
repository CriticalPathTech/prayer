import type { FollowupFilters } from './api';

export type { FollowupFilters };

export interface FollowupDraft {
  filters: FollowupFilters;
  minAge: { value: number; unit: 'hours' | 'days' };
}

export interface FollowupPill extends FollowupDraft {
  id: string;
  label: string;
}

export const EMPTY_DRAFT: FollowupDraft = {
  filters: { noPrayers: false, noReactions: false, noComments: false, noUpdates: false, noModResponse: false },
  minAge: { value: 0, unit: 'days' },
};

export const FOLLOWUP_PILLS: readonly FollowupPill[] = [
  {
    id: 'no-prayers-24h',
    label: 'No prayers for 24 hours',
    filters: { noPrayers: true, noReactions: false, noComments: false, noUpdates: false, noModResponse: false },
    minAge: { value: 24, unit: 'hours' },
  },
  {
    id: 'no-prayers-3d',
    label: 'No prayers for 3 days',
    filters: { noPrayers: true, noReactions: false, noComments: false, noUpdates: false, noModResponse: false },
    minAge: { value: 3, unit: 'days' },
  },
  {
    id: 'no-comments-5d',
    label: 'No comments for 5 days',
    filters: { noPrayers: false, noReactions: false, noComments: true, noUpdates: false, noModResponse: false },
    minAge: { value: 5, unit: 'days' },
  },
  {
    id: 'no-reply-7d',
    label: 'No leadership reply for 7 days',
    filters: { noPrayers: false, noReactions: false, noComments: false, noUpdates: false, noModResponse: true },
    minAge: { value: 7, unit: 'days' },
  },
  {
    id: 'no-updates-14d',
    label: 'No updates for 14 days',
    filters: { noPrayers: false, noReactions: false, noComments: false, noUpdates: true, noModResponse: false },
    minAge: { value: 14, unit: 'days' },
  },
  {
    id: 'stale-14d',
    label: 'Stale 14 days',
    filters: { noPrayers: true, noReactions: false, noComments: true, noUpdates: true, noModResponse: false },
    minAge: { value: 14, unit: 'days' },
  },
];

function sameFilters(a: FollowupFilters, b: FollowupFilters): boolean {
  return (
    a.noPrayers === b.noPrayers &&
    a.noReactions === b.noReactions &&
    a.noComments === b.noComments &&
    a.noUpdates === b.noUpdates &&
    a.noModResponse === b.noModResponse
  );
}

export function matchPill(draft: FollowupDraft): string | null {
  for (const pill of FOLLOWUP_PILLS) {
    if (
      sameFilters(pill.filters, draft.filters) &&
      pill.minAge.value === draft.minAge.value &&
      pill.minAge.unit === draft.minAge.unit
    ) {
      return pill.id;
    }
  }
  return null;
}
