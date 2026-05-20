import { describe, expect, it } from 'vitest';

import { FOLLOWUP_PILLS, matchPill, type FollowupDraft } from './mod-followup-pills';

describe('mod-followup pills', () => {
  it('exposes six pills with stable ids', () => {
    expect(FOLLOWUP_PILLS).toHaveLength(6);
    expect(FOLLOWUP_PILLS.map((p) => p.id)).toEqual([
      'no-prayers-24h',
      'no-prayers-3d',
      'no-comments-5d',
      'no-reply-7d',
      'no-updates-14d',
      'stale-14d',
    ]);
  });

  it('matchPill returns the pill id when a draft exactly matches', () => {
    const stale: FollowupDraft = {
      filters: {
        noPrayers: true,
        noReactions: false,
        noComments: true,
        noUpdates: true,
        noModResponse: false,
      },
      minAge: { value: 14, unit: 'days' },
    };
    expect(matchPill(stale)).toBe('stale-14d');
  });

  it('matchPill returns null when no pill matches', () => {
    const custom: FollowupDraft = {
      filters: {
        noPrayers: true,
        noReactions: true,
        noComments: false,
        noUpdates: false,
        noModResponse: false,
      },
      minAge: { value: 0, unit: 'days' },
    };
    expect(matchPill(custom)).toBeNull();
  });
});
