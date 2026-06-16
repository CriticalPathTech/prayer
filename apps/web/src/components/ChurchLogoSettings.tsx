import { useRef, useState, type JSX } from 'react';

import { useChurchLogo } from '../hooks/useChurchLogo';
import { useOrgLogo, useRefreshOrgLogo } from '../hooks/useOrgLogo';
import type { LogoFillMode } from '../lib/api';

import { Button } from './ui/Button';

const FILL_OPTIONS: { value: LogoFillMode; label: string; hint: string }[] = [
  { value: 'original', label: 'Original colors', hint: 'Render the SVG exactly as uploaded.' },
  { value: 'adaptive', label: 'Adaptive', hint: 'Recolor to one ink that adapts to each surface.' },
  { value: 'custom', label: 'Custom color', hint: 'Recolor to a single color you choose.' },
];

function LogoPreview(props: {
  svg: string;
  fillMode: LogoFillMode;
  color: string;
  size: number;
  surfaceColor?: string;
}): JSX.Element {
  const tinted = props.fillMode !== 'original';
  return (
    <span
      className={tinted ? 'logo-mark logo-mark--tinted' : 'logo-mark'}
      style={{
        width: props.size,
        height: props.size,
        color: props.fillMode === 'custom' ? props.color : props.surfaceColor,
      }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: props.svg }}
    />
  );
}

export function ChurchLogoSettings(): JSX.Element {
  const currentLogo = useOrgLogo();
  const refreshLogo = useRefreshOrgLogo();
  const { preview, busy, error, runPreview, save, remove, reset } = useChurchLogo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fillMode, setFillMode] = useState<LogoFillMode>('original');
  const [color, setColor] = useState('#6d5ae6');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.includes('svg') && !file.name.endsWith('.svg')) return;
    const text = await file.text();
    setFillMode('original');
    await runPreview(text);
  }

  async function onConfirm(): Promise<void> {
    const ok = await save(fillMode, color);
    if (ok) await refreshLogo();
  }

  async function onRemove(): Promise<void> {
    const ok = await remove();
    if (ok) await refreshLogo();
  }

  return (
    <section className="mb-8 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
      <h2 className="mb-3 font-serif text-lg font-medium">Church logo</h2>

      {preview ? (
        <div>
          <p className="mb-3 text-sm text-[var(--fg-2)]">
            Preview your logo, choose how it's colored, then confirm to make it live.
          </p>

          <div className="mb-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 rounded-md bg-[var(--color-primary,#6d5ae6)] px-3 py-2 text-white">
              <LogoPreview
                svg={preview.sanitizedSvg}
                fillMode={fillMode}
                color={color}
                size={26}
                surfaceColor="#ffffff"
              />
              <span className="text-sm font-semibold">Header</span>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-md border border-[var(--border-soft)] px-4 py-3">
              <LogoPreview
                svg={preview.sanitizedSvg}
                fillMode={fillMode}
                color={color}
                size={40}
                surfaceColor="var(--fg-1)"
              />
              <span className="text-xs text-[var(--fg-3)]">Login screen</span>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-[var(--color-primary,#6d5ae6)] px-2.5 py-1.5 text-white">
              <LogoPreview
                svg={preview.sanitizedSvg}
                fillMode={fillMode}
                color={color}
                size={20}
                surfaceColor="#ffffff"
              />
              <span className="text-xs font-semibold">Mobile</span>
            </div>
          </div>

          <fieldset className="mb-3">
            <legend className="mb-1 text-sm font-medium text-[var(--fg-1)]">Logo color</legend>
            <div className="flex flex-col gap-1.5">
              {FILL_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-[var(--fg-2)]">
                  <input
                    type="radio"
                    name="fill-mode"
                    value={opt.value}
                    checked={fillMode === opt.value}
                    onChange={() => setFillMode(opt.value)}
                  />
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-xs text-[var(--fg-3)]">— {opt.hint}</span>
                </label>
              ))}
            </div>
            {fillMode === 'custom' ? (
              <input
                type="color"
                aria-label="Custom logo color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="mt-2 h-8 w-16"
              />
            ) : null}
          </fieldset>

          {preview.warnings.multiColor ? (
            <p className="mb-3 rounded border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-xs text-[var(--fg-2)]">
              This logo uses multiple colors — recoloring may flatten detail. Use "Original colors"
              to keep it as designed.
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <Button onClick={() => void onConfirm()} disabled={busy}>
              {busy ? 'Saving…' : 'Confirm & save'}
            </Button>
            <Button variant="quiet" onClick={reset} disabled={busy}>
              Discard
            </Button>
          </div>
        </div>
      ) : currentLogo ? (
        <div className="flex items-center gap-4">
          <span
            className={
              currentLogo.fillMode === 'original' ? 'logo-mark' : 'logo-mark logo-mark--tinted'
            }
            style={{
              width: 48,
              height: 48,
              color:
                currentLogo.fillMode === 'custom'
                  ? (currentLogo.color ?? undefined)
                  : 'var(--fg-1)',
            }}
            aria-hidden
            dangerouslySetInnerHTML={{ __html: currentLogo.svg }}
          />
          <div className="flex gap-2">
            <Button variant="quiet" onClick={() => fileRef.current?.click()}>
              Replace…
            </Button>
            <Button variant="quiet" onClick={() => void onRemove()} disabled={busy}>
              Remove logo
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <p className="text-sm text-[var(--fg-2)]">
            Using the default prayer-hands icon. Upload an SVG to use your church's own mark.
          </p>
          <Button variant="quiet" onClick={() => fileRef.current?.click()}>
            Choose SVG…
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-ember-600">
          {error}
        </p>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        aria-label="Upload SVG logo"
        className="sr-only"
        onChange={(e) => void onFile(e)}
      />
    </section>
  );
}
