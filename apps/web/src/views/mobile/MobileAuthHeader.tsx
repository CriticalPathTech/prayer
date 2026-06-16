import type { JSX } from 'react';

import { LogoMark } from '../../components/ui/LogoMark';

export function MobileAuthHeader({ wordmark = 'Prayer' }: { wordmark?: string } = {}): JSX.Element {
  return (
    <div className="mb-6 mt-12 inline-flex items-center gap-2.5 font-serif text-[28px] font-semibold tracking-[-0.02em] text-[var(--fg-1)]">
      <LogoMark size={24} />
      <span>{wordmark}</span>
    </div>
  );
}
