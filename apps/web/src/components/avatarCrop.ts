import type { Area } from 'react-easy-crop';

const OUTPUT_SIZE = 512;

export async function cropToWebpDataUrl(
  imageSrc: string,
  cropPixels: Area,
  rotation: number,
): Promise<string> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.save();
  ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-OUTPUT_SIZE / 2, -OUTPUT_SIZE / 2);

  ctx.drawImage(
    img,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  ctx.restore();

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('canvas.toBlob returned null'));
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
        reader.readAsDataURL(blob);
      },
      'image/webp',
      0.85,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}
