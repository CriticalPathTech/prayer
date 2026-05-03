import type { JSX, ReactNode } from 'react';

import { Icon, type IconName } from './Icon';

type Kind = 'default' | 'accent' | 'answered' | 'warm' | 'sage' | 'ember';

export interface PillProps {
  kind?: Kind;
  leadingIcon?: IconName;
  children: ReactNode;
  className?: string;
}

const KIND_CLASSES: Record<Kind, string> = {
  default: 'bg-parchment-100 text-[var(--fg-3)] border border-[var(--border-soft)]',
  accent: 'bg-vesper-50 text-vesper-700 border border-vesper-200',
  answered:
    'bg-[var(--answered-bg)] text-[var(--answered-fg)] border border-[var(--answered-border)]',
  warm: 'bg-warm-100 text-warm-500 border border-warm-300',
  sage: 'bg-sage-100 text-sage-500 border border-sage-300',
  ember: 'bg-ember-50 text-ember-600 border border-ember-100',
};

export function Pill({
  kind = 'default',
  leadingIcon,
  children,
  className = '',
}: PillProps): JSX.Element {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        KIND_CLASSES[kind],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {leadingIcon ? <Icon name={leadingIcon} size={14} /> : null}
      {children}
    </span>
  );
}
