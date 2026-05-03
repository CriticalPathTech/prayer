import type { JSX } from 'react';
import { useState } from 'react';

import { Button } from './ui/Button';
import type { IconName } from './ui/Icon';

export interface CommentFormProps {
  onSubmit: (body: string) => Promise<void>;
  label?: string;
  submitLabel?: string;
  placeholder?: string;
  submitIcon?: IconName;
  maxLength?: number;
  rows?: number;
}

export function CommentForm({
  onSubmit,
  label = 'Reply',
  submitLabel = 'Send',
  placeholder = 'Reach out privately…',
  submitIcon = 'message',
  maxLength = 2000,
  rows = 3,
}: CommentFormProps): JSX.Element {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    if (body.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body);
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <label className="block">
        <span className="sr-only">{label}</span>
        <textarea
          aria-label={label}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          className="w-full min-h-[80px] rounded-md border border-[var(--border-default)] bg-[var(--bg-raised)] px-3.5 py-3 font-serif text-[15px] leading-relaxed text-[var(--fg-1)] outline-none transition-colors placeholder:text-[var(--fg-4)] focus:border-vesper-400 focus-visible:shadow-[0_0_0_3px_theme(colors.vesper.100)]"
        />
      </label>
      {error ? <p className="text-xs text-ember-600">{error}</p> : null}
      <Button
        variant="primary"
        size="sm"
        leadingIcon={submitIcon}
        onClick={() => void handleSubmit()}
        disabled={busy}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
