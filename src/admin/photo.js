// Coach photo: resize and re-encode to WebP in the browser. No DOM access at import time (tested in Node).
const TARGET = 300 * 1024;
const ENCODER = `${import.meta.env?.BASE_URL ?? '/'}vendor/jsquash-webp/encode.js`;

/** Fit w×h inside maxW×maxH keeping the aspect; never upscales. */
export function fitSize(w, h, maxW = 800, maxH = 1200) {
  const k = Math.min(1, maxW / w, maxH / h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

// Safari's canvas.toBlob ignores 'image/webp' and quietly hands back a PNG.
export const isWebpBlob = (blob) => blob?.type === 'image/webp';

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** File -> {bytes, width, height}; throws {code: 'heic'} when the browser can't decode the file. */
export async function toWebp(file, { maxW = 800, maxH = 1200 } = {}) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw { code: 'heic' };
  }
  const { w, h } = fitSize(bmp.width, bmp.height, maxW, maxH);
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  // A canvas re-encode carries no EXIF/GPS, whichever encoder runs.
  let bytes;
  for (const q of [0.82, 0.7]) {
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/webp', q));
    if (isWebpBlob(blob)) bytes = new Uint8Array(await blob.arrayBuffer());
    else {
      const { default: encode } = await import(/* @vite-ignore */ ENCODER);
      bytes = new Uint8Array(await encode(ctx.getImageData(0, 0, w, h), { quality: q * 100 }));
    }
    if (bytes.length <= TARGET) break;
  }
  return { bytes, width: w, height: h };
}
