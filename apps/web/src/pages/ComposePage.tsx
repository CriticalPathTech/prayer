import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DEFAULT_EXPIRY_DAYS, ExpiryPicker } from '../components/ExpiryPicker';
import { DEFAULT_PIN_DAYS, PinDurationPicker } from '../components/PinDurationPicker';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { useAuth } from '../hooks/useAuth';
import { useDraft } from '../hooks/useDraft';
import { ApiError, publishMyDraft, type DraftInput } from '../lib/api';

function daysFromExpiresAt(iso: string | null | undefined): number {
  if (!iso) return DEFAULT_EXPIRY_DAYS;
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / (24 * 3600_000));
  if (days < 1 || days > 365) return DEFAULT_EXPIRY_DAYS;
  return days;
}

function buildExpiresAt(days: number): string {
  // 30s buffer so the 1-day floor still parses as ≥ 1 day by the time the
  // request lands on the server.
  return new Date(Date.now() + days * 24 * 3600_000 + 30_000).toISOString();
}

export function ComposePage(): JSX.Element {
  const navigate = useNavigate();
  const { me } = useAuth();
  const { draft, loading, save, flush, saving, lastSavedAt, error: draftError } = useDraft();

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

  // Every user-input change schedules a debounced save.
  function queueSave(next: Partial<{ body: string; days: number; isAnonymous: boolean }>): void {
    const input: DraftInput = {
      body: next.body ?? body,
      expires_at: buildExpiresAt(next.days ?? days),
      is_anonymous: next.isAnonymous ?? isAnonymous,
    };
    save(input);
  }

  async function onShare(): Promise<void> {
    setPublishError(null);
    if (body.trim().length === 0) {
      setPublishError('Body is required');
      return;
    }
    setPublishing(true);
    try {
      // Make sure the latest edits are persisted before publish sees the row.
      await flush();
      const published = await publishMyDraft(
        pinDays !== null ? { pin_duration_days: pinDays as 1 | 3 | 7 | 14 | 30 } : {},
      );
      navigate(`/posts/${published.post.id}`);
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setPublishing(false);
    }
  }

  const statusHint = useMemo<string | null>(() => {
    if (loading) return null;
    if (saving) return 'Saving…';
    if (draftError) return `Couldn't save: ${draftError}`;
    if (lastSavedAt) return 'Saved';
    return null;
  }, [loading, saving, lastSavedAt, draftError]);

  return (
    <div className="mx-auto max-w-feed">
      <h1 className="mb-6 font-serif text-[28px] font-semibold tracking-[-0.02em] text-[var(--fg-1)]">
        New prayer request
      </h1>

      <Field label="">
        <textarea
          aria-label="Body"
          value={body}
          onChange={(e) => {
            const next = e.target.value;
            setBody(next);
            queueSave({ body: next });
          }}
          rows={8}
          placeholder="What's on your heart?"
          className="w-full min-h-[220px] rounded-md border border-[var(--border-default)] bg-[var(--bg-raised)] px-4 py-4 font-serif text-[17px] leading-relaxed text-[var(--fg-1)] outline-none transition-colors placeholder:text-[var(--fg-4)] focus:border-vesper-400 focus-visible:shadow-[0_0_0_3px_theme(colors.vesper.100)]"
        />
      </Field>

      <Field label="Keep visible for">
        <ExpiryPicker
          value={days}
          onChange={(next) => {
            setDays(next);
            queueSave({ days: next });
          }}
        />
      </Field>

      <Field label="Post without your name" help="Only Super Users can see who wrote it.">
        <label className="inline-flex items-center gap-2 text-sm text-[var(--fg-2)] cursor-pointer">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => {
              const next = e.target.checked;
              setAnonymous(next);
              queueSave({ isAnonymous: next });
            }}
            className="h-4 w-4 accent-vesper-500"
          />
          <span>Anonymous</span>
        </label>
      </Field>

      {isPrivileged ? (
        <Field label="Pin this post">
          <label className="inline-flex items-center gap-2 text-sm text-[var(--fg-2)] cursor-pointer">
            <input
              aria-label="Pin this post"
              type="checkbox"
              checked={pinDays !== null}
              onChange={(e) => {
                setPinDays(e.target.checked ? DEFAULT_PIN_DAYS : null);
              }}
              className="h-4 w-4 accent-vesper-500"
            />
            <span>Pin this post</span>
          </label>
          {pinDays !== null ? (
            <div className="mt-3">
              <PinDurationPicker value={pinDays} onChange={setPinDays} />
            </div>
          ) : null}
        </Field>
      ) : null}

      {publishError ? <p className="mb-4 text-sm text-ember-600">{publishError}</p> : null}

      <div className="mt-6 flex items-center justify-end gap-3">
        {statusHint ? (
          <span className="text-xs text-[var(--fg-3)]" aria-live="polite">
            {statusHint}
          </span>
        ) : null}
        <Button
          variant="primary"
          onClick={() => void onShare()}
          disabled={publishing || body.trim().length === 0}
        >
          Share
        </Button>
      </div>
    </div>
  );
}
