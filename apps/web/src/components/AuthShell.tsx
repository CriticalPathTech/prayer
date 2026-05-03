import type { JSX, ReactNode } from 'react';

import { Icon } from './ui/Icon';

export function AuthShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-[var(--bg-page)] font-sans text-[var(--fg-2)] relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <Icon name="pray" size={32} className="opacity-[0.06] scale-[8.75]" />
      </div>
      <div className="relative z-10 mx-auto mt-24 max-w-sm rounded-lg border border-[var(--border-soft)] bg-[var(--bg-raised)] p-7 shadow-warm-sm">
        <div className="mb-5 inline-flex items-center gap-2.5 font-serif font-semibold text-[28px] tracking-[-0.02em] text-[var(--fg-1)]">
          <Icon name="pray" size={24} />
          <span>Prayer</span>
        </div>
        {children}
      </div>
    </div>
  );
}
