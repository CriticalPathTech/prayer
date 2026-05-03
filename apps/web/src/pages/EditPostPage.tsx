import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { DEFAULT_EXPIRY_DAYS, ExpiryPicker } from '../components/ExpiryPicker';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { useEditBuffer } from '../hooks/useEditBuffer';
import { usePost } from '../hooks/usePost';
import { ApiError, apiFetch } from '../lib/api';

function daysFromIso(iso: string | null | undefined): number {
  if (!iso) return DEFAULT_EXPIRY_DAYS;
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / (24 * 3600_000));
  if (days < 1 || days > 365) return DEFAULT_EXPIRY_DAYS;
  return days;
}

function buildExpiresAt(days: number): string {
  // 30s buffer so the 1-day floor still parses as >= 1 day by the time the
  // request lands on the server.
  return new Date(Date.now() + days * 24 * 3600_000 + 30_000).toISOString();
}

export function EditPostPage(): JSX.Element {
  const { id } = useParams();
  const postId = id ?? '';
  const navigate = useNavigate();
  const { data, loading, notFound, error: loadError } = usePost(postId);
  const { buffer, set: setBuffer, clear: clearBuffer, lastSavedAt } = useEditBuffer(postId);

  const [body, setBody] = useState('');
  const [days, setDays] = useState<number>(DEFAULT_EXPIRY_DAYS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [sessionDirty, setSessionDirty] = useState(false);
  const hydrated = useRef(false);

  // Hydrate form once when usePost resolves. `buffer` is captured from the
  // initial render on purpose (buffer wins over server); subsequent keystrokes
  // mutate `buffer` but the ref-guard makes those re-runs no-ops. We omit
  // `buffer` from deps to make that intent explicit.
  useEffect(() => {
    if (hydrated.current) return;
    if (loading || !data) return;
    hydrated.current = true;
    if (buffer && typeof buffer.body === 'string') {
      setBody(buffer.body);
    } else {
      setBody(data.post.body);
    }
    if (buffer && buffer.expires_at !== undefined) {
      setDays(daysFromIso(buffer.expires_at));
    } else {
      setDays(daysFromIso(data.post.expires_at));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buffer intentionally captured once
  }, [loading, data]);

  // Poll the deadline every 30s while mounted.
  useEffect(() => {
    if (!data) return;
    function check(): void {
      setDeadlinePassed(new Date(data!.post.edit_deadline).getTime() <= Date.now());
    }
    check();
    const h = window.setInterval(check, 30_000);
    return () => window.clearInterval(h);
  }, [data]);

  const canSave = !saving && !deadlinePassed && body.trim().length > 0;

  async function onSave(): Promise<void> {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch(`/posts/${postId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body, expires_at: buildExpiresAt(days) }),
      });
      clearBuffer();
      navigate(`/posts/${postId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EDIT_DEADLINE_PASSED') {
        setDeadlinePassed(true);
      } else {
        setSaveError(err instanceof ApiError ? err.message : 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  }

  function onCancel(): void {
    navigate(`/posts/${postId}`);
  }

  const statusHint = useMemo<string | null>(() => {
    if (saving) return 'Saving…';
    if (sessionDirty && lastSavedAt) return 'Saved locally';
    return null;
  }, [saving, sessionDirty, lastSavedAt]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-feed">
        <p className="py-16 text-center font-serif text-[18px] text-[var(--fg-3)]">
          Post not found
        </p>
      </div>
    );
  }
  if (loading || !data) {
    return (
      <div className="mx-auto max-w-feed">
        <p className="py-16 text-center text-sm text-[var(--fg-3)]">Loading…</p>
      </div>
    );
  }
  if (!data.post.is_own_post) {
    return (
      <div className="mx-auto max-w-feed">
        <p className="py-16 text-center font-serif text-[18px] text-[var(--fg-3)]">
          You can only edit your own posts.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-feed">
      <h1 className="mb-6 font-serif text-[28px] font-semibold tracking-[-0.02em] text-[var(--fg-1)]">
        Edit prayer request
      </h1>

      <Field label="">
        <textarea
          aria-label="Body"
          value={body}
          onChange={(e) => {
            const next = e.target.value;
            setBody(next);
            setBuffer({ body: next });
            setSessionDirty(true);
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
            setBuffer({ expires_at: buildExpiresAt(next) });
            setSessionDirty(true);
          }}
        />
      </Field>

      {deadlinePassed ? (
        <p className="mb-4 text-sm text-ember-600">Edit window has passed.</p>
      ) : null}
      {loadError ? <p className="mb-4 text-sm text-ember-600">{loadError}</p> : null}
      {saveError ? <p className="mb-4 text-sm text-ember-600">{saveError}</p> : null}

      <div className="mt-6 flex items-center justify-end gap-3">
        {statusHint ? (
          <span className="text-xs text-[var(--fg-3)]" aria-live="polite">
            {statusHint}
          </span>
        ) : null}
        <Button variant="quiet" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void onSave()} disabled={!canSave}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
