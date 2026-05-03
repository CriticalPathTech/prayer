import type { JSX } from 'react';
import { useState } from 'react';

import { gravatarUrl } from '../../lib/gravatar';

import { Icon } from './Icon';

type Size = 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  name: string | null;
  email?: string | undefined;
  avatarUrl?: string | null | undefined;
  anonymous?: boolean;
  size?: Size;
}

const SIZE_PX: Record<Size, number> = { sm: 24, md: 36, lg: 48, xl: 128 };
const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-6 w-6 text-[11px]',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-32 w-32 text-3xl',
};

function transformedUrl(url: string, sizePx: number): string {
  const px = sizePx * 2;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}width=${px}&height=${px}&resize=cover`;
}

export function Avatar({
  name,
  email,
  avatarUrl,
  anonymous,
  size = 'md',
}: AvatarProps): JSX.Element {
  const sizePx = SIZE_PX[size];
  const sizeClass = SIZE_CLASSES[size];
  const [uploadErr, setUploadErr] = useState(false);
  const [gravatarErr, setGravatarErr] = useState(false);

  if (anonymous) {
    return (
      <div
        aria-label="Anonymous"
        className={[
          'inline-flex items-center justify-center rounded-full',
          'bg-parchment-200 text-[var(--fg-3)] border border-[var(--border-soft)]',
          sizeClass,
        ].join(' ')}
      >
        <Icon name="user-anon" size={size === 'xl' ? 48 : size === 'lg' ? 20 : 16} />
      </div>
    );
  }

  if (avatarUrl && !uploadErr) {
    return (
      <img
        src={transformedUrl(avatarUrl, sizePx)}
        alt={name ?? ''}
        onError={() => setUploadErr(true)}
        className={['rounded-full object-cover', sizeClass].join(' ')}
      />
    );
  }

  if (email && !gravatarErr) {
    return (
      <img
        src={gravatarUrl(email, sizePx * 2)}
        alt={name ?? ''}
        onError={() => setGravatarErr(true)}
        className={['rounded-full object-cover', sizeClass].join(' ')}
      />
    );
  }

  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      aria-hidden
      className={[
        'inline-flex items-center justify-center rounded-full font-semibold',
        'bg-vesper-100 text-vesper-700',
        sizeClass,
      ].join(' ')}
    >
      {initial}
    </div>
  );
}
