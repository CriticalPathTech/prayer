// PostImages renders a prayer's photos read-only.
//
// Cards show only the cover thumb — a feed page fetches many posts and the
// thumbs are what keep it cheap. Detail shows every image full size.
//
// Archived posts have had their full-size objects purged to save storage, but
// their thumbs are kept, so `purged` renders the thumb plus an explanation
// rather than a broken image.

import type { JSX } from 'react';

import type { PostImage } from '../hooks/useFeed';

export interface PostImagesProps {
  images: PostImage[];
  variant: 'card' | 'detail';
}

export function PostImages({ images, variant }: PostImagesProps): JSX.Element | null {
  if (images.length === 0) return null;

  const shown = variant === 'card' ? images.slice(0, 1) : images;
  const extraCount = images.length - shown.length;

  return (
    <div className={variant === 'card' ? 'relative mt-3' : 'mt-4 space-y-3'}>
      {shown.map((image, index) => {
        const src =
          variant === 'card' || image.purged ? image.thumb_url : (image.url ?? image.thumb_url);
        // No alt-text feature in v1 (spec non-goal) — images are decorative,
        // and a fabricated content description would be worse for screen
        // reader users than silence. A positional label ("Cover photo" /
        // "Photo 2") still satisfies role=img in a11y tooling without
        // inventing a description, matching ImageTray's convention.
        const alt = index === 0 ? 'Cover photo' : `Photo ${index + 1}`;
        return (
          <figure key={image.id} className="m-0">
            <img
              src={src}
              alt={alt}
              width={image.width}
              height={image.height}
              loading="lazy"
              className={
                variant === 'card'
                  ? 'max-h-96 w-full rounded-md border border-[var(--border-soft)] object-cover'
                  : 'w-full rounded-md border border-[var(--border-soft)] object-cover'
              }
            />
            {image.purged && variant === 'detail' ? (
              <figcaption className="mt-1 text-xs text-[var(--fg-3)]">
                Full-size photo is no longer available.
              </figcaption>
            ) : null}
          </figure>
        );
      })}
      {variant === 'card' && extraCount > 0 ? (
        <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          +{extraCount}
        </span>
      ) : null}
    </div>
  );
}
