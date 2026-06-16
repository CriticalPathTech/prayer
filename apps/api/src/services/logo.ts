import type { Database } from '@prayer/db';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import type { Kysely } from 'kysely';

import { ValidationError } from '../middleware/error.js';

export type LogoFillMode = 'original' | 'adaptive' | 'custom';

export interface OrgLogo {
  svg: string;
  fillMode: LogoFillMode;
  color: string | null;
}

export interface SanitizeResult {
  svg: string;
  strippedTags: string[];
  detectedColors: string[];
  multiColor: boolean;
}

const MAX_SVG_BYTES = 64 * 1024;
const TRIVIAL_COLORS = new Set(['none', 'transparent', 'currentcolor', 'inherit', '']);

// One jsdom window for the process; DOMPurify binds to it. jsdom's window type
// is structurally compatible with what DOMPurify needs but not nominally, so cast.
const { window } = new JSDOM('');
const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis);

function collectColors(doc: Document): string[] {
  const colors = new Set<string>();
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of ['fill', 'stroke'] as const) {
      const v = el.getAttribute(attr)?.trim().toLowerCase();
      if (v && !TRIVIAL_COLORS.has(v)) colors.add(v);
    }
    const style = el.getAttribute('style') ?? '';
    for (const m of style.matchAll(/(?:fill|stroke)\s*:\s*([^;]+)/gi)) {
      const v = m[1]?.trim().toLowerCase();
      if (v && !TRIVIAL_COLORS.has(v)) colors.add(v);
    }
  });
  return Array.from(colors);
}

/** Sanitize an uploaded SVG for safe inline rendering. Throws ValidationError
 * on empty / oversize / non-SVG input. Returns the cleaned markup plus
 * advisory warnings (what was stripped, whether it uses multiple colors). */
export function sanitizeLogoSvg(raw: string): SanitizeResult {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new ValidationError('SVG is required');
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_SVG_BYTES) {
    throw new ValidationError('SVG must be 64KB or smaller');
  }

  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject'],
    ADD_ATTR: ['viewBox'],
  });

  const strippedTags = Array.from(
    new Set(
      DOMPurify.removed
        .map((r) => {
          const node =
            (r as { element?: { nodeName?: string } }).element ??
            (r as { attribute?: { nodeName?: string } }).attribute;
          return node?.nodeName ? String(node.nodeName).toLowerCase() : null;
        })
        .filter((n): n is string => n !== null),
    ),
  );

  const doc = new window.DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    throw new ValidationError('Not a valid SVG');
  }

  const detectedColors = collectColors(doc);
  return { svg: clean, strippedTags, detectedColors, multiColor: detectedColors.length > 1 };
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const VALID_FILL_MODES: readonly LogoFillMode[] = ['original', 'adaptive', 'custom'];
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export async function getOrgLogo(db: Kysely<Database>, orgId: string): Promise<OrgLogo | null> {
  const row = await db
    .selectFrom('orgs')
    .select(['logo_svg', 'logo_fill_mode', 'logo_color'])
    .where('id', '=', orgId)
    .executeTakeFirst();
  if (!row || !row.logo_svg) return null;
  return {
    svg: row.logo_svg,
    fillMode: (row.logo_fill_mode ?? 'original') as LogoFillMode,
    color: row.logo_color ?? null,
  };
}

export interface SaveOrgLogoInput {
  orgId: string;
  svg: string;
  fillMode: LogoFillMode;
  color?: string | null;
}

export async function saveOrgLogo(db: Kysely<Database>, input: SaveOrgLogoInput): Promise<OrgLogo> {
  if (!VALID_FILL_MODES.includes(input.fillMode)) {
    throw new ValidationError('fillMode must be original, adaptive, or custom');
  }
  let color: string | null = null;
  if (input.fillMode === 'custom') {
    if (!input.color || !HEX_COLOR_RE.test(input.color)) {
      throw new ValidationError('color must be a #RRGGBB hex string when fillMode is custom');
    }
    color = input.color.toLowerCase();
  }
  // Re-sanitize authoritatively — never trust a previously-sanitized blob.
  const { svg } = sanitizeLogoSvg(input.svg);
  await db
    .updateTable('orgs')
    .set({
      logo_svg: svg,
      logo_fill_mode: input.fillMode,
      logo_color: color,
      logo_updated_at: new Date(),
    })
    .where('id', '=', input.orgId)
    .execute();
  return { svg, fillMode: input.fillMode, color };
}

export async function removeOrgLogo(db: Kysely<Database>, orgId: string): Promise<void> {
  await db
    .updateTable('orgs')
    .set({ logo_svg: null, logo_fill_mode: null, logo_color: null, logo_updated_at: new Date() })
    .where('id', '=', orgId)
    .execute();
}
