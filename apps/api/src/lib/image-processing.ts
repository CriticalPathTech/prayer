// image-processing.ts is the server-side enforcement boundary for post images.
//
// Native Swift and Kotlin clients exist alongside the web app, so client-side
// resizing can never be a correctness guarantee — only a bandwidth
// optimization. Everything that must be true of a stored image is made true
// here: no EXIF (phone photos carry GPS coordinates and camera serial numbers,
// which would deanonymize an anonymous prayer request), bounded dimensions,
// bounded decode cost, and a uniform WebP output.
//
// Pure module: no DB, no S3, no Express. Keeps it trivially unit-testable.

import sharp from 'sharp';

const MAX_EDGE = 2048;
// Feed cards render thumb_url stretched to full card width (~660px on
// desktop, more on a 2x display) — 400px was being upscaled by the browser,
// which is most of what users perceived as "over-compressed." The thumb is
// what survives archival (full-size objects are purged, thumbs are kept
// forever), so 800px roughly quadruples per-image retained storage — still
// small in absolute terms and worth it for legibility.
const THUMB_EDGE = 800;
const WEBP_QUALITY = 88;

// Decompression-bomb guard: refuse anything that would decode to more than
// ~50 megapixels regardless of how small the compressed bytes are.
const MAX_PIXELS = 50_000_000;

export class UnsupportedImageError extends Error {
  constructor(message = 'Unsupported image format.') {
    super(message);
    this.name = 'UnsupportedImageError';
  }
}

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

/**
 * Sniff the container from magic bytes. The client's Content-Type is never
 * trusted — renaming a file is the cheapest possible attack.
 */
export function detectImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  // ISO-BMFF: 4-byte size, then 'ftyp', then a brand. HEIC/HEIF brands only.
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
      return 'image/heic';
    }
  }
  return null;
}

/**
 * Resize, strip metadata, and re-encode to WebP. Returns the full-size variant
 * (long edge <= 2048, never upscaled) and an 800px thumbnail.
 *
 * The thumbnail is what survives archival — a post's full-size objects are
 * purged when it archives, but the thumb is kept so old posts still render.
 */
export async function processPostImage(input: Buffer): Promise<ProcessedImage> {
  if (detectImageMime(input) === null) throw new UnsupportedImageError();

  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new UnsupportedImageError();
  }
  if (!meta.width || !meta.height) throw new UnsupportedImageError();
  if (meta.width * meta.height > MAX_PIXELS) {
    throw new UnsupportedImageError('Image is too large to process.');
  }

  // `withoutEnlargement` is what makes a small photo pass through untouched
  // rather than being blown up to 1600px of blur.
  const full = await sharp(input, { limitInputPixels: MAX_PIXELS })
    .rotate() // bake in EXIF orientation before the metadata is discarded
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, smartSubsample: true })
    .toBuffer();

  const thumb = await sharp(input, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, smartSubsample: true })
    .toBuffer();

  const fullMeta = await sharp(full).metadata();

  return {
    full,
    thumb,
    width: fullMeta.width ?? 0,
    height: fullMeta.height ?? 0,
  };
}
