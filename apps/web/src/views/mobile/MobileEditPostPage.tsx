import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { DEFAULT_EXPIRY_DAYS, ExpiryPicker } from '../../components/ExpiryPicker';
import { PostImages } from '../../components/PostImages';
import { usePost } from '../../hooks/usePost';
import { apiFetch } from '../../lib/api';

import { MobilePageHeader } from './MobilePageHeader';

function daysFromIso(iso: string | null | undefined): number {
  if (!iso) return DEFAULT_EXPIRY_DAYS;
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / (24 * 3600_000));
  if (days < 1 || days > 365) return DEFAULT_EXPIRY_DAYS;
  return days;
}

function buildExpiresAt(days: number): string {
  return new Date(Date.now() + days * 24 * 3600_000 + 30_000).toISOString();
}

export function MobileEditPostPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, notFound, error } = usePost(id ?? '');

  const [body, setBody] = useState<string>('');
  const [days, setDays] = useState<number>(DEFAULT_EXPIRY_DAYS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    if (loading || !data) return;
    hydrated.current = true;
    setBody(data.post.body);
    setDays(daysFromIso(data.post.expires_at));
  }, [loading, data]);

  useEffect(() => {
    if (!data) return;
    function check(): void {
      setDeadlinePassed(new Date(data!.post.edit_deadline).getTime() <= Date.now());
    }
    check();
    const h = window.setInterval(check, 30_000);
    return () => window.clearInterval(h);
  }, [data]);

  if (notFound) {
    return (
      <>
        <MobilePageHeader variant={{ kind: 'close', title: 'Edit request' }} />
        <div className="px-4 py-16 text-center text-sm text-[var(--fg-3)]">Post not found.</div>
      </>
    );
  }
  if (loading || !data) {
    return (
      <>
        <MobilePageHeader variant={{ kind: 'close', title: 'Edit request' }} />
        <div className="px-4 py-16 text-center text-sm text-[var(--fg-3)]">Loading…</div>
      </>
    );
  }

  const originalDays = daysFromIso(data.post.expires_at);
  const dirty = hydrated.current && (body !== data.post.body || days !== originalDays);
  const canSave = dirty && !saving && !deadlinePassed && body.trim().length > 0;

  async function handleSave(): Promise<void> {
    if (!id) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch(`/posts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body, expires_at: buildExpiresAt(days) }),
      });
      navigate(-1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <MobilePageHeader
        variant={{
          kind: 'close',
          title: 'Edit request',
          right: (
            <button
              type="button"
              disabled={!canSave}
              onClick={() => void handleSave()}
              className="inline-flex h-9 items-center rounded-md bg-vesper-500 px-3 text-sm font-medium text-white shadow-warm-sm transition-colors disabled:opacity-50 active:bg-vesper-600"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          ),
        }}
      />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-3">
        {error ? <p className="text-sm text-ember-600">{error}</p> : null}
        {saveError ? <p className="text-sm text-ember-600">{saveError}</p> : null}
        {deadlinePassed ? (
          <p className="rounded-md border border-warm-300 bg-warm-50 px-3 py-2 text-sm text-warm-700">
            The edit window has passed. You can no longer edit this post.
          </p>
        ) : null}
        <textarea
          aria-label="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={deadlinePassed}
          className="min-h-[40vh] w-full resize-none rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-3 font-serif text-[16px] leading-relaxed text-[var(--fg-2)] outline-none focus-visible:shadow-[var(--focus-ring)]"
        />
        {data.post.images.length > 0 ? (
          <div>
            <PostImages images={data.post.images} variant="detail" />
            <p className="mt-2 text-xs text-[var(--fg-3)]">
              Photos can&rsquo;t be changed after a prayer request is shared.
            </p>
          </div>
        ) : null}
        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.06em] text-[var(--fg-3)]">
            Expires after
          </span>
          <ExpiryPicker value={days} onChange={setDays} />
        </div>
      </div>
    </>
  );
}
