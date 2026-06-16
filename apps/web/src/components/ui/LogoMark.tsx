import type { CSSProperties, JSX } from 'react';

import { useOrgLogo } from '../../hooks/useOrgLogo';

import { Icon } from './Icon';

export interface LogoMarkProps {
  size?: 14 | 16 | 18 | 20 | 24 | 32 | 48;
  className?: string;
}

/** The church brand mark. Renders the org's custom SVG logo when set,
 * otherwise the built-in prayer-hands icon. Adaptive/custom fill modes apply
 * a CSS tint (see `.logo-mark--tinted` in index.css) that drives the SVG fill
 * from `currentColor`. */
export function LogoMark({ size = 20, className }: LogoMarkProps): JSX.Element {
  const logo = useOrgLogo();

  if (!logo) {
    return <Icon name="pray" size={size} className={className} />;
  }

  const tinted = logo.fillMode === 'adaptive' || logo.fillMode === 'custom';
  const style: CSSProperties = { width: size, height: size };
  if (logo.fillMode === 'custom' && logo.color) {
    style.color = logo.color;
  }

  return (
    <span
      role="img"
      aria-hidden
      className={['logo-mark', tinted ? 'logo-mark--tinted' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      style={style}
      // SVG is sanitized server-side before storage (services/logo.ts).
      dangerouslySetInnerHTML={{ __html: logo.svg }}
    />
  );
}
