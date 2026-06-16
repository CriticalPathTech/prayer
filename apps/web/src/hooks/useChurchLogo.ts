import { useState } from 'react';

import {
  previewChurchLogo,
  removeChurchLogo,
  saveChurchLogo,
  type LogoFillMode,
  type LogoPreviewResult,
} from '../lib/api';

export interface UseChurchLogoResult {
  preview: LogoPreviewResult | null;
  busy: boolean;
  error: string | null;
  runPreview: (svgText: string) => Promise<void>;
  save: (fillMode: LogoFillMode, color?: string) => Promise<boolean>;
  remove: () => Promise<boolean>;
  reset: () => void;
}

/** Drives the upload -> preview -> confirm flow. The intermediate preview state
 * lives here (client-side); the server `/preview` endpoint provides the
 * authoritative sanitized SVG + warnings so what you confirm is what's stored. */
export function useChurchLogo(): UseChurchLogoResult {
  const [preview, setPreview] = useState<LogoPreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPreview(svgText: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewChurchLogo(svgText));
    } catch {
      setError("That file couldn't be used. Upload a valid SVG.");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function save(fillMode: LogoFillMode, color?: string): Promise<boolean> {
    if (!preview) return false;
    setBusy(true);
    setError(null);
    try {
      await saveChurchLogo({
        svg: preview.sanitizedSvg,
        fillMode,
        ...(fillMode === 'custom' && color ? { color } : {}),
      });
      setPreview(null);
      return true;
    } catch {
      setError("Couldn't save the logo. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await removeChurchLogo();
      return true;
    } catch {
      setError("Couldn't remove the logo. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function reset(): void {
    setPreview(null);
    setError(null);
  }

  return { preview, busy, error, runPreview, save, remove, reset };
}
