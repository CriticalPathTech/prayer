import type { JSX } from 'react';

export interface HiddenBannerProps {
  kind: 'post' | 'comment';
  /** When true, render the moderator-facing variant with attribution. */
  moderatorView?: boolean;
  /** Display name of the moderator who hid the post manually. Null when
   * the hide was automatic (2-flag threshold). */
  hiddenBy?: string | null;
  /** 'auto' | 'manual' — shown only in moderator view. */
  source?: 'auto' | 'manual' | null;
}

export function HiddenBanner({
  kind,
  moderatorView,
  hiddenBy,
  source,
}: HiddenBannerProps): JSX.Element {
  if (moderatorView) {
    const detail =
      source === 'manual' && hiddenBy
        ? `Hidden by ${hiddenBy}`
        : source === 'auto'
          ? 'Auto-hidden (2 flags)'
          : 'Hidden';
    return (
      <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <span className="font-medium">{detail}.</span> <span>Visible to moderators only.</span>
      </div>
    );
  }
  return (
    <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      This {kind} was hidden by a moderator. Contact a moderator with questions.
    </div>
  );
}
