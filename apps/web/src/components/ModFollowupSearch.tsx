import { useState, type JSX } from 'react';

import {
  EMPTY_DRAFT,
  FOLLOWUP_PILLS,
  matchPill,
  type FollowupDraft,
} from '../lib/mod-followup-pills';

interface Props {
  initial: FollowupDraft;
  onSearch: (draft: FollowupDraft) => void;
}

export function ModFollowupSearch({ initial, onSearch }: Props): JSX.Element {
  const [draft, setDraft] = useState<FollowupDraft>(initial);
  const activePill = matchPill(draft);

  function setFilter<K extends keyof FollowupDraft['filters']>(key: K, value: boolean): void {
    setDraft((d) => ({ ...d, filters: { ...d.filters, [key]: value } }));
  }

  return (
    <div className="space-y-4 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
      <div className="flex flex-wrap gap-2">
        {FOLLOWUP_PILLS.map((p) => {
          const active = activePill === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => setDraft({ filters: p.filters, minAge: p.minAge })}
              className={
                active
                  ? 'rounded-full border border-vesper-600 bg-vesper-100 px-3 py-1 text-[13px] font-medium text-vesper-700'
                  : 'rounded-full border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-1 text-[13px] text-[var(--fg-2)]'
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.filters.noPrayers}
            onChange={(e) => setFilter('noPrayers', e.target.checked)}
          />
          <span>No prayers</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.filters.noReactions}
            onChange={(e) => setFilter('noReactions', e.target.checked)}
          />
          <span>No reactions</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.filters.noComments}
            onChange={(e) => setFilter('noComments', e.target.checked)}
          />
          <span>No comments</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.filters.noUpdates}
            onChange={(e) => setFilter('noUpdates', e.target.checked)}
          />
          <span>No updates</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.filters.noModResponse}
            onChange={(e) => setFilter('noModResponse', e.target.checked)}
          />
          <span>No leadership reply</span>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-[var(--fg-3)]">
          For at least
          <input
            type="number"
            min={0}
            max={8760}
            aria-label="for at least"
            value={draft.minAge.value}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                minAge: {
                  ...d.minAge,
                  value: Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0,
                },
              }))
            }
            className="mt-1 w-20 rounded border border-[var(--border-soft)] px-2 py-1 text-sm"
          />
        </label>
        <div className="flex flex-col text-xs text-[var(--fg-3)]">
          <span id="mod-followup-unit-label">Unit</span>
          <div
            role="group"
            aria-labelledby="mod-followup-unit-label"
            className="mt-1 inline-flex overflow-hidden rounded border border-[var(--border-soft)]"
          >
            {(['hours', 'days'] as const).map((u) => {
              const active = draft.minAge.unit === u;
              return (
                <button
                  key={u}
                  type="button"
                  aria-label={u}
                  aria-pressed={active}
                  onClick={() => setDraft((d) => ({ ...d, minAge: { ...d.minAge, unit: u } }))}
                  className={
                    active
                      ? 'bg-vesper-600 px-3 py-1 text-sm font-medium text-white'
                      : 'bg-[var(--bg-page)] px-3 py-1 text-sm text-[var(--fg-2)]'
                  }
                >
                  {u}
                </button>
              );
            })}
          </div>
        </div>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setDraft(EMPTY_DRAFT)}
            className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-1.5 text-sm text-[var(--fg-2)]"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => onSearch(draft)}
            className="rounded-md bg-vesper-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            Search
          </button>
        </div>
      </div>
    </div>
  );
}
