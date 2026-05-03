import type { JSX } from 'react';

export interface NewActivityBannerProps {
  visible: boolean;
  onRefresh: () => void;
}

export function NewActivityBanner({
  visible,
  onRefresh,
}: NewActivityBannerProps): JSX.Element | null {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onRefresh}
      className="mb-4 inline-flex w-full items-center gap-2.5 rounded-md border border-vesper-200 bg-vesper-50 px-3.5 py-2.5 text-[13px] font-medium text-vesper-700 motion-safe:animate-slide-down"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-vesper-500" />
      <span>New activity — tap to refresh</span>
    </button>
  );
}
