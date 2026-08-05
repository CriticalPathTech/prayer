import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  detectImageMime,
  processPostImage,
  UnsupportedImageError,
} from '../../src/lib/image-processing.js';

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .withMetadata({
      exif: {
        IFD0: { Copyright: 'test' },
        GPS: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
      },
    })
    .jpeg()
    .toBuffer();
}

describe('detectImageMime', () => {
  it('sniffs real bytes and rejects a renamed non-image', async () => {
    expect(detectImageMime(await makeJpeg(10, 10))).toBe('image/jpeg');
    expect(detectImageMime(Buffer.from('not an image at all'))).toBeNull();
  });
});

describe('processPostImage', () => {
  it('caps the long edge at 2048, emits an 800px thumb, and outputs webp', async () => {
    const { full, thumb, width, height } = await processPostImage(await makeJpeg(4000, 3000));

    expect(width).toBe(2048);
    expect(height).toBe(1536);

    const fullMeta = await sharp(full).metadata();
    expect(fullMeta.format).toBe('webp');
    expect(fullMeta.width).toBe(2048);

    const thumbMeta = await sharp(thumb).metadata();
    expect(thumbMeta.format).toBe('webp');
    expect(thumbMeta.width).toBe(800);
  });

  it('strips all metadata including GPS EXIF', async () => {
    const { full } = await processPostImage(await makeJpeg(800, 600));
    const meta = await sharp(full).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it('does not upscale an image smaller than the cap', async () => {
    const { width, height } = await processPostImage(await makeJpeg(300, 200));
    expect(width).toBe(300);
    expect(height).toBe(200);
  });

  it('rejects a non-image buffer', async () => {
    await expect(processPostImage(Buffer.from('nope'))).rejects.toBeInstanceOf(
      UnsupportedImageError,
    );
  });
});
