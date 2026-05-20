import { describe, expect, it } from 'vitest';

import { parseApplied, serializeApplied } from './mod-followup-url';

describe('mod-followup URL helpers', () => {
  it('parseApplied returns null when no relevant params are present', () => {
    expect(parseApplied(new URLSearchParams(''))).toBeNull();
    expect(parseApplied(new URLSearchParams('foo=bar'))).toBeNull();
  });

  it('parseApplied populates filters and minAge from URL', () => {
    const out = parseApplied(
      new URLSearchParams('no_prayers=true&min_age_value=7&min_age_unit=days'),
    );
    expect(out).toEqual({
      filters: { noPrayers: true, noReactions: false, noComments: false, noUpdates: false, noModResponse: false },
      minAge: { value: 7, unit: 'days' },
      sort: 'oldest',
    });
  });

  it('serializeApplied omits zero / false values and round-trips', () => {
    const draft = {
      filters: { noPrayers: true, noReactions: false, noComments: false, noUpdates: false, noModResponse: false },
      minAge: { value: 3, unit: 'days' as const },
    };
    const params = serializeApplied(draft);
    expect(params.toString()).toBe('no_prayers=true&min_age_value=3&min_age_unit=days');
    expect(parseApplied(params)).toMatchObject(draft);
  });
});
