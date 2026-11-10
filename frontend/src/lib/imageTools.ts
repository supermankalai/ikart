/** Image tools for custom T-shirt designs (all run on the customer's device). */

export type Source = HTMLImageElement | HTMLCanvasElement;

const MAX_SIDE = 4000; // keep very large photos workable in the browser

const sizeOf = (s: Source) =>
  s instanceof HTMLImageElement ? { w: s.naturalWidth, h: s.naturalHeight } : { w: s.width, h: s.height };

export function toCanvas(src: Source, maxSide = MAX_SIDE): HTMLCanvasElement {
  const { w, h } = sizeOf(src);
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** Average colour of the four corners: usually the background of a photo or logo. */
export function cornerColor(src: Source): string {
  const c = toCanvas(src, 400);
  const ctx = c.getContext("2d")!;
  const k = Math.max(2, Math.round(Math.min(c.width, c.height) * 0.04));
  let r = 0, g = 0, b = 0, n = 0;
  for (const [x, y] of [[0, 0], [c.width - k, 0], [0, c.height - k], [c.width - k, c.height - k]]) {
    const d = ctx.getImageData(x, y, k, k).data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
  }
  return n ? rgbToHex(r / n, g / n, b / n) : "#ffffff";
}

/** True if the image already has transparent areas. */
export function hasTransparency(src: Source): boolean {
  const c = toCanvas(src, 300);
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 16) if (d[i] < 200) return true;
  return false;
}

/** Makes pixels close to `color` transparent (tolerance 0-100), with a soft edge. */
export function removeBackground(src: Source, color: string, tolerance: number): HTMLCanvasElement {
  const c = toCanvas(src);
  const ctx = c.getContext("2d")!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const [kr, kg, kb] = hexToRgb(color);
  const t = (tolerance / 100) * 200 + 8;
  const feather = 30;
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.sqrt((d[i] - kr) ** 2 + (d[i + 1] - kg) ** 2 + (d[i + 2] - kb) ** 2);
    if (dist < t) d[i + 3] = 0;
    else if (dist < t + feather) d[i + 3] = Math.min(d[i + 3], Math.round(((dist - t) / feather) * 255));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * One-colour print. Images with transparency are recoloured as they are; photos/logos on a plain
 * background become "ink": dark parts take the colour, light parts become transparent.
 */
export function singleColor(src: Source, color: string, threshold = 60): HTMLCanvasElement {
  const c = toCanvas(src);
  const ctx = c.getContext("2d")!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const [r, g, b] = hexToRgb(color);
  const transparent = hasTransparency(c);
  const cut = (threshold / 100) * 255;
  for (let i = 0; i < d.length; i += 4) {
    if (!transparent) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i + 3] = Math.max(0, Math.min(255, Math.round((cut - lum) * 4 + 128)));
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export interface ImageFx {
  bg?: { color: string; tolerance: number } | null;
  single?: { color: string; threshold: number } | null;
}

/** Applies background removal and/or single colour to the original image. */
export function processImage(original: Source, fx: ImageFx): Source {
  let out: Source = original;
  if (fx.bg) out = removeBackground(out, fx.bg.color, fx.bg.tolerance);
  if (fx.single) out = singleColor(out, fx.single.color, fx.single.threshold);
  return out;
}

/** Rasterises an SVG/PNG (clipart) to a canvas, optionally filled with one colour. */
export async function rasterizeArt(url: string, color: string | null, size = 1400): Promise<HTMLCanvasElement> {
  let src = url;
  if (color && url.startsWith("data:image/svg+xml")) {
    src = url.replace(/currentColor/g, encodeURIComponent(color));
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not load this art"));
    i.src = src;
  });
  const w0 = img.naturalWidth || 100;
  const h0 = img.naturalHeight || 100;
  const k = size / Math.max(w0, h0);
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * k);
  c.height = Math.round(h0 * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  if (color && !url.startsWith("data:image/svg+xml")) return singleColor(c, color);
  return c;
}
