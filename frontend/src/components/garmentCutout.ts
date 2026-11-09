/**
 * Cuts a garment out of a product photo so it can hang on the 3D rail.
 *
 * Works for photos of the garment alone on a plain background (white, grey or any single colour,
 * small gradients and soft shadows are fine). Returns null when the photo is not suitable
 * (busy background, a person wearing it, garment the same colour as the background...), so the
 * caller can fall back to the 3D model.
 */
export interface Cutout {
  canvas: HTMLCanvasElement; // transparent PNG-like canvas, cropped to the garment
  aspect: number; // width / height
}

const MAX = 560;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

const dist = (d: Uint8ClampedArray, i: number, r: number, g: number, b: number) =>
  Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b);

export async function cutoutGarment(url: string): Promise<Cutout | null> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(url);
  } catch {
    return null;
  }
  const iw = img.naturalWidth || 600, ih = img.naturalHeight || 750;
  const scale = Math.min(1, MAX / Math.max(iw, ih));
  const w = Math.max(8, Math.round(iw * scale)), h = Math.max(8, Math.round(ih * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return null; // image from another site without CORS
  }
  const d = data.data;
  const n = w * h;

  // 1. Background colour = median of the border pixels; the border must be mostly that colour
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
  const ch = (k: number) => border.map((p) => d[p * 4 + k]).sort((a, b) => a - b)[border.length >> 1];
  const br = ch(0), bg = ch(1), bb = ch(2);
  // already transparent PNG? use its alpha directly
  const transparentBorder = border.filter((p) => d[p * 4 + 3] < 20).length / border.length > 0.8;
  if (!transparentBorder) {
    const plain = border.filter((p) => dist(d, p * 4, br, bg, bb) < 60).length / border.length;
    if (plain < 0.7) return null; // busy background
  }

  // 2. Flood-fill the background from the border (follows soft gradients and shadows)
  const isBg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  const near = (p: number) => (transparentBorder ? d[p * 4 + 3] < 40 : dist(d, p * 4, br, bg, bb) < 48);
  for (const p of border) if (!isBg[p] && near(p)) { isBg[p] = 1; queue[qt++] = p; }
  while (qh < qt) {
    const p = queue[qh++];
    const x = p % w, y = (p / w) | 0;
    const i = p * 4;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
      if (q < 0 || isBg[q]) continue;
      const j = q * 4;
      const ok = transparentBorder
        ? d[j + 3] < 40
        : dist(d, j, br, bg, bb) < 48 || (dist(d, j, d[i], d[i + 1], d[i + 2]) < 9 && dist(d, j, br, bg, bb) < 110);
      if (ok) { isBg[q] = 1; queue[qt++] = q; }
    }
  }

  // 3. Keep only the largest garment piece (drops stray specks, text, logos in corners)
  const label = new Int32Array(n);
  let best = 0, bestSize = 0, cur = 0;
  for (let s = 0; s < n; s++) {
    if (isBg[s] || label[s]) continue;
    cur++;
    let size = 0;
    qh = qt = 0;
    queue[qt++] = s;
    label[s] = cur;
    while (qh < qt) {
      const p = queue[qh++];
      size++;
      const x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && !isBg[q] && !label[q]) { label[q] = cur; queue[qt++] = q; }
      }
    }
    if (size > bestSize) { bestSize = size; best = cur; }
  }
  const frac = bestSize / n;
  if (frac < 0.08 || frac > 0.9) return null; // nothing found, or background not separable

  // 4. Alpha mask with a soft 1px edge, cropped to the garment
  let minX = w, minY = h, maxX = 0, maxY = 0;
  const alpha = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    if (label[p] !== best) continue;
    alpha[p] = 1;
    const x = p % w, y = (p / w) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  // garment touching the photo edges = probably cropped / worn by a model
  const touches = [minX <= 1, maxX >= w - 2, minY <= 1, maxY >= h - 2].filter(Boolean).length;
  if (touches >= 2) return null;
  // A T-shirt or pants outline (sleeves, neck, legs) fills ~55-80% of its bounding box.
  // A nearly solid block is a logo, box, card or folded item, so use the 3D model instead.
  const fill = bestSize / ((maxX - minX + 1) * (maxY - minY + 1));
  if (fill > 0.86) return null;

  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1, chh = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = chh;
  const octx = out.getContext("2d")!;
  const od = octx.createImageData(cw, chh);
  for (let y = 0; y < chh; y++) {
    for (let x = 0; x < cw; x++) {
      const sx = x + minX, sy = y + minY, p = sy * w + sx;
      // 3x3 average for a soft edge
      let a = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = sx + dx, yy = sy + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) { a += alpha[yy * w + xx]; k++; }
      }
      const o = (y * cw + x) * 4, i = p * 4;
      od.data[o] = d[i];
      od.data[o + 1] = d[i + 1];
      od.data[o + 2] = d[i + 2];
      od.data[o + 3] = Math.round((alpha[p] ? Math.max(a / k, 0.5) : a / k * 0.6) * (transparentBorder ? d[i + 3] / 255 : 1) * 255);
    }
  }
  octx.putImageData(od, 0, 0);
  return { canvas: out, aspect: cw / chh };
}
