import type { JSX } from 'react';
import { useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';

import { uploadMyAvatar, type MeDto } from '../lib/api';
import { authErrorCopy } from '../lib/authErrorCopy';

import { cropToWebpDataUrl } from './avatarCrop';
import { Button } from './ui/Button';

export interface AvatarCropDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: (me: MeDto) => void;
}

export function AvatarCropDialog({
  open,
  onClose,
  onSaved,
}: AvatarCropDialogProps): JSX.Element | null {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [cropPixels, setCropPixels] = useState<Area | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function onFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageSrc(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function onSave(): Promise<void> {
    if (!imageSrc || !cropPixels) return;
    setSubmitting(true);
    setErr(null);
    try {
      const dataUrl = await cropToWebpDataUrl(imageSrc, cropPixels, rotation);
      const me = await uploadMyAvatar(dataUrl);
      onSaved(me);
    } catch (caught) {
      setErr(authErrorCopy(caught).text);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Change photo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="w-[92vw] max-w-md rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-5 shadow-warm-md">
        <h2 className="mb-4 font-serif text-lg font-medium text-[var(--fg-1)]">Change photo</h2>

        {!imageSrc ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={onFile}
            />
            <Button type="button" onClick={() => fileRef.current?.click()}>
              Choose photo
            </Button>
          </>
        ) : (
          <>
            <div className="relative mb-4 h-64 w-full bg-parchment-100 rounded-md overflow-hidden">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={1}
                cropShape="round"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={(_area, pixels) => setCropPixels(pixels)}
              />
            </div>
            <label className="mb-2 block text-xs text-[var(--fg-3)]" htmlFor="avatar-zoom">
              Zoom
            </label>
            <input
              id="avatar-zoom"
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="mb-3 w-full"
            />
            <label className="mb-2 block text-xs text-[var(--fg-3)]" htmlFor="avatar-rotation">
              Rotation
            </label>
            <input
              id="avatar-rotation"
              type="range"
              min={-180}
              max={180}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(parseInt(e.target.value, 10))}
              className="mb-4 w-full"
            />
          </>
        )}

        {err ? <p className="mb-3 text-sm text-ember-600">{err}</p> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          {imageSrc ? (
            <Button
              type="button"
              onClick={() => void onSave()}
              disabled={!cropPixels || submitting}
            >
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
