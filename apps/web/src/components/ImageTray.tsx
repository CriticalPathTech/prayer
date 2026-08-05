// ImageTray is the compose-time photo picker.
//
// Deliberately drag-free. Mobile Safari has no file drag-and-drop, and a
// drag-to-trash target on touch competes with page scroll — so one interaction
// model serves desktop and mobile web identically, and the native iOS/Android
// clients can mirror it. A plain <input type="file"> opens the system photo
// picker or camera on mobile and the file dialog on desktop, no branching.
//
// No reordering in v1: order is upload order and the first slot is the cover.

import type { JSX } from 'react';
import { useId, useRef, useState } from 'react';

import type { PostImage } from '../hooks/useFeed';
import { deletePostImage, uploadPostImage } from '../lib/api';

import { Button } from './ui/Button';
import { Icon } from './ui/Icon';

const MAX_IMAGES = 3;

interface PendingUpload {
  key: string;
  file: File;
  error: string | null;
}

export interface ImageTrayProps {
  images: PostImage[];
  onChange: (next: PostImage[]) => void;
  disabled?: boolean;
}

export function ImageTray({ images, onChange, disabled = false }: ImageTrayProps): JSX.Element {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const inputId = useId();
  const nextKey = useRef(0);
  // Two uploads finishing in the same tick would each close over a stale
  // `images`, so the latest list is tracked in a ref as well.
  const latest = useRef(images);
  latest.current = images;

  async function upload(file: File, key: string): Promise<void> {
    try {
      const image = await uploadPostImage(file);
      setPending((p) => p.filter((u) => u.key !== key));
      const next = [...latest.current, image];
      latest.current = next;
      onChange(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setPending((p) => p.map((u) => (u.key === key ? { ...u, error: message } : u)));
    }
  }

  function onPick(files: FileList | null): void {
    if (!files) return;
    const room = MAX_IMAGES - images.length - pending.length;
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      const key = `u${nextKey.current++}`;
      setPending((p) => [...p, { key, file, error: null }]);
      void upload(file, key);
    }
  }

  function retry(entry: PendingUpload): void {
    setPending((p) => p.map((u) => (u.key === entry.key ? { ...u, error: null } : u)));
    void upload(entry.file, entry.key);
  }

  function cancel(key: string): void {
    setPending((p) => p.filter((u) => u.key !== key));
  }

  async function remove(image: PostImage): Promise<void> {
    setRemoving(image.id);
    try {
      await deletePostImage(image.id);
      const next = latest.current.filter((i) => i.id !== image.id);
      latest.current = next;
      onChange(next);
    } finally {
      setRemoving(null);
    }
  }

  const full = images.length + pending.length >= MAX_IMAGES;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {images.map((image, index) => (
          <figure key={image.id} className="relative w-24">
            <div className="h-24 w-24 overflow-hidden rounded-md border border-[var(--border-soft)] bg-parchment-100">
              <img
                src={image.thumb_url}
                alt={index === 0 ? 'Cover photo' : `Photo ${index + 1}`}
                width={96}
                height={96}
                className="h-full w-full object-cover"
              />
            </div>
            <button
              type="button"
              aria-label="Remove photo"
              disabled={disabled || removing === image.id}
              onClick={() => void remove(image)}
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-raised)] text-[var(--fg-3)] shadow-warm-sm transition-colors hover:bg-parchment-100 hover:text-[var(--fg-1)] disabled:opacity-50"
            >
              <Icon name="x" size={14} />
            </button>
            {index === 0 ? (
              <figcaption className="mt-1 text-center text-xs text-[var(--fg-3)]">
                Cover photo
              </figcaption>
            ) : null}
          </figure>
        ))}

        {pending.map((entry) => (
          <div key={entry.key} className="flex w-24 flex-col items-center gap-1">
            <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-[var(--border-default)] bg-parchment-100">
              {entry.error === null ? (
                <span role="status" className="text-xs text-[var(--fg-3)]">
                  Uploading…
                </span>
              ) : (
                <span role="alert" className="px-1 text-center text-xs text-ember-600">
                  {entry.error}
                </span>
              )}
            </div>
            {entry.error !== null ? (
              <div className="flex gap-1">
                <Button variant="quiet" size="sm" onClick={() => retry(entry)}>
                  Retry
                </Button>
                <Button variant="quiet" size="sm" onClick={() => cancel(entry.key)}>
                  Cancel
                </Button>
              </div>
            ) : null}
          </div>
        ))}

        {full ? null : (
          <label
            htmlFor={inputId}
            className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border-default)] text-[var(--fg-3)] transition-colors hover:border-vesper-400 hover:text-[var(--fg-1)]"
          >
            <Icon name="plus" size={20} />
            <span className="text-xs font-medium">Add photo</span>
            <input
              id={inputId}
              type="file"
              accept="image/*"
              multiple
              disabled={disabled}
              className="sr-only"
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      <p className="text-xs text-[var(--fg-4)]">
        {images.length} of {MAX_IMAGES}
      </p>
    </div>
  );
}
