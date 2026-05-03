import type { JSX } from 'react';

import { Icon } from '../../components/ui/Icon';

export function MobileAuthHeader(): JSX.Element {
  return (
    <div className="mb-6 mt-12 inline-flex items-center gap-2.5 font-serif text-[28px] font-semibold tracking-[-0.02em] text-[var(--fg-1)]">
      <Icon name="pray" size={24} aria-hidden />
      <span>Prayer</span>
    </div>
  );
}
