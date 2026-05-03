import type { ButtonHTMLAttributes, JSX } from 'react';

import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'ghost' | 'quiet' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-vesper-500 text-[var(--fg-on-accent)] hover:bg-vesper-600 border border-transparent',
  ghost:
    'bg-white text-[var(--fg-2)] border border-[var(--border-default)] hover:bg-parchment-100 hover:text-[var(--fg-1)]',
  quiet:
    'bg-transparent text-[var(--fg-3)] border border-transparent hover:bg-parchment-100 hover:text-[var(--fg-1)]',
  danger: 'bg-ember-50 text-ember-600 border border-ember-100 hover:bg-ember-100',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] font-medium gap-1.5',
  md: 'h-9 px-3.5 text-sm font-semibold gap-2',
  lg: 'h-11 px-5 text-[15px] font-semibold gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  leadingIcon,
  trailingIcon,
  className = '',
  children,
  ...rest
}: ButtonProps): JSX.Element {
  const iconSize = size === 'lg' ? 18 : 16;
  return (
    <button
      type="button"
      className={[
        'inline-flex items-center justify-center rounded-md font-sans whitespace-nowrap',
        'transition-colors duration-200',
        'focus:outline-none focus-visible:shadow-[var(--focus-ring)]',
        'disabled:opacity-50 disabled:cursor-default',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {leadingIcon ? <Icon name={leadingIcon} size={iconSize} /> : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} size={iconSize} /> : null}
    </button>
  );
}
