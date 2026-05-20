import type { AppliedQuery } from '../hooks/useModFollowup';
import type { FollowupDraft } from './mod-followup-pills';

export function parseApplied(params: URLSearchParams): AppliedQuery | null {
  const hasAny =
    params.has('no_prayers') ||
    params.has('no_reactions') ||
    params.has('no_comments') ||
    params.has('no_updates') ||
    params.has('no_mod_response') ||
    params.has('min_age_value') ||
    params.has('min_age_unit');
  if (!hasAny) return null;
  const unit = params.get('min_age_unit');
  return {
    filters: {
      noPrayers: params.get('no_prayers') === 'true',
      noReactions: params.get('no_reactions') === 'true',
      noComments: params.get('no_comments') === 'true',
      noUpdates: params.get('no_updates') === 'true',
      noModResponse: params.get('no_mod_response') === 'true',
    },
    minAge: {
      value: Number(params.get('min_age_value') ?? 0),
      unit: unit === 'hours' ? 'hours' : 'days',
    },
    sort: params.get('sort') === 'newest' ? 'newest' : 'oldest',
  };
}

export function serializeApplied(draft: FollowupDraft): URLSearchParams {
  const p = new URLSearchParams();
  if (draft.filters.noPrayers) p.set('no_prayers', 'true');
  if (draft.filters.noReactions) p.set('no_reactions', 'true');
  if (draft.filters.noComments) p.set('no_comments', 'true');
  if (draft.filters.noUpdates) p.set('no_updates', 'true');
  if (draft.filters.noModResponse) p.set('no_mod_response', 'true');
  if (draft.minAge.value > 0) {
    p.set('min_age_value', String(draft.minAge.value));
    p.set('min_age_unit', draft.minAge.unit);
  }
  return p;
}
