import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DEFAULT_EXPIRY_DAYS, ExpiryPicker } from '../../components/ExpiryPicker';
import { DEFAULT_PIN_DAYS, PinDurationPicker } from '../../components/PinDurationPicker';
import { useAuth } from '../../hooks/useAuth';
import { useDraft } from '../../hooks/useDraft';
import { ApiError, publishMyDraft } from '../../lib/api';

import { MobilePageHeader } from './MobilePageHeader';

function daysFromExpiresAt(iso: string | null | undefined): number {
  if (!iso) return DEFAULT_EXPIRY_DAYS;
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / (24 * 3600_000));
  if (days < 1 || days > 365) return DEFAULT_EXPIRY_DAYS;
  return days;
}

function buildExpiresAt(days: number): string {
  return new Date(Date.now() + days * 24 * 3600_000 + 30_000).toISOString();
}

export function MobileComposePage(): JSX.Element {
  const navigate = useNavigate();
  const { me } = useAuth();
  const { draft, loading, save, flush, saving, error: draftError } = useDraft();

  const isPrivileged = me?.role === 'moderator' || me?.role === 'super_user';

  const [body, setBody] = useState('');
  const [days, setDays] = useState<number>(DEFAULT_EXPIRY_DAYS);
  const [isAnonymous, setAnonymous] = useState(false);
  const [pinDays, setPinDays] = useState<number | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const hydrated = useRef(false);

  // Hydrate form state from the server's draft once GET /me/draft resolves.
  useEffect(() => {
    if (!loading && !hydrated.current) {
      hydrated.current = true;
      if (draft) {
        setBody(draft.body);
        setDays(daysFromExpiresAt(draft.expires_at));
        setAnonymous(draft.is_anonymous);
      }
    }
  }, [loading, draft]);

  function queueSave(next: Partial<{ body: string; days: number; isAnonymous: boolean }>): void {
    save({
      body: next.body ?? body,
      expires_at: buildExpiresAt(next.days ?? days),
      is_anonymous: next.isAnonymous ?? isAnonymous,
    });
  }

  async function handlePublish(): Promise<void> {
    setPublishError(null);
    setPublishing(true);
    try {
      await flush();
      await publishMyDraft(pinDays !== null ? { pin_duration_days: pinDays as 1 | 3 | 7 | 14 | 30 } : {});
      navigate('/');
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setPublishing(false);
    }
  }

  const canPublish = body.trim().length > 0 && !publishing;
  const error = publishError ?? draftError;

  return (
    <>
      <MobilePageHeader
        variant={{
          kind: 'close',
          title: 'New request',
          right: (
            <button
              type="button"
              disabled={!canPublish}
              onClick={() => void handlePublish()}
              className="inline-flex h-9 items-center rounded-md bg-vesper-500 px-3 text-sm font-medium text-white shadow-warm-sm transition-colors disabled:opacity-50 active:bg-vesper-600"
            >
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          ),
        }}
      />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-3">
        {error ? <p className="text-sm text-ember-600">{error}</p> : null}
        <textarea
          aria-label="Body"
          value={body}
          onChange={(e) => {
            const next = e.target.value;
            setBody(next);
            queueSave({ body: next });
          }}
          placeholder="Share your prayer request…"
          className="min-h-[40vh] w-full resize-none rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-3 font-serif text-[16px] leading-relaxed text-[var(--fg-2)] outline-none focus-visible:shadow-[var(--focus-ring)]"
        />
        <label className="flex items-center gap-2 text-sm text-[var(--fg-2)]">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => {
              const next = e.target.checked;
              setAnonymous(next);
              queueSave({ isAnonymous: next });
            }}
          />
          Post anonymously
        </label>
        {isPrivileged ? (
          <div>
            <label className="flex items-center gap-2 text-sm text-[var(--fg-2)]">
              <input
                aria-label="Pin this post"
                type="checkbox"
                checked={pinDays !== null}
                onChange={(e) => {
                  setPinDays(e.target.checked ? DEFAULT_PIN_DAYS : null);
                }}
              />
              Pin this post
            </label>
            {pinDays !== null ? (
              <div className="mt-2">
                <PinDurationPicker value={pinDays} onChange={setPinDays} />
              </div>
            ) : null}
          </div>
        ) : null}
        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.06em] text-[var(--fg-3)]">
            Expires after
          </span>
          <ExpiryPicker
            value={days}
            onChange={(next) => {
              setDays(next);
              queueSave({ days: next });
            }}
          />
        </div>
      </div>
      {saving ? (
        <span className="sr-only" aria-live="polite">
          Saving…
        </span>
      ) : null}
    </>
  );
}
