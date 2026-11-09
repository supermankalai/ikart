/**
 * Geometry for the custom-print T-shirt mockup. One definition drives both the on-screen
 * editor (SVG) and the final preview images (canvas), so they always match.
 * Coordinates are in a 500 × 560 box.
 */
import type { Placement, PrintSide } from "./types";

export const TEE_W = 500;
export const TEE_H = 560;

/** Printable area on each side, roughly 12 × 16 inches on an adult tee. */
export const PRINT: Record<PrintSide, { x: number; y: number; w: number; h: number }> = {
  front: { x: 165, y: 112, w: 170, h: 226 },
  back: { x: 165, y: 96, w: 170, h: 226 },
};
export const PRINT_WIDTH_INCHES = 12;
export const PRINT_HEIGHT_INCHES = (PRINT_WIDTH_INCHES * 226) / 170;

const BODY = "L392 66 L478 158 L424 210 L392 182 L396 528 Q250 540 104 528 L108 182 L76 210 L22 158 L108 66 Z";

export const SHAPES: Record<PrintSide, { body: string; neckInner: string | null; collar: string }> = {
  // Front: deep round neck showing the inside of the back collar
  front: {
    body: `M185 38 C200 80 300 80 315 38 ${BODY}`,
    neckInner: "M185 38 C210 54 290 54 315 38 C300 80 200 80 185 38 Z",
    collar: "M185 38 C200 80 300 80 315 38",
  },
  // Back: shallow neckline
  back: {
    body: `M185 38 C210 54 290 54 315 38 ${BODY}`,
    neckInner: null,
    collar: "M185 38 C210 54 290 54 315 38",
  },
};
export const SEAM_PATHS = ["M120 70 Q112 128 108 182", "M380 70 Q388 128 392 182", "M31 151 L83 201", "M469 151 L417 201"];

export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

export function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const n = parseInt(m[1], 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
}

/**
 * Placement that fits a w×h item inside the print area at `maxWidth` of its width,
 * centred horizontally with its top at `top` (fractions of the print area).
 */
export function fitPlacement(side: PrintSide, imgW: number, imgH: number, maxWidth = 0.8, top = 0.06): Placement {
  const area = PRINT[side];
  const aspect = imgH / imgW;
  let w = area.w * maxWidth;
  let h = w * aspect;
  if (h > area.h * 0.8) {
    h = area.h * 0.8;
    w = h / aspect;
  }
  return { x: (area.w - w) / 2 / area.w, y: top, w: w / area.w, h: h / area.h, rotation: 0 };
}

/** Scale an item around its centre to `widthFraction` of the print-area width (keeps its shape). */
export function resizePlacement(p: Placement, widthFraction: number): Placement {
  const ratio = widthFraction / p.w;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const h = p.h * ratio;
  return { ...p, x: cx - widthFraction / 2, y: cy - h / 2, w: widthFraction, h };
}

/** Item box in mockup coordinates. */
export function toBox(side: PrintSide, p: Placement) {
  const a = PRINT[side];
  return { x: a.x + p.x * a.w, y: a.y + p.y * a.h, w: p.w * a.w, h: p.h * a.h };
}

/** Approximate print resolution (dots per inch) of an image at its current size. */
export function printDpi(imgW: number, p: Placement): number {
  return imgW / (p.w * PRINT_WIDTH_INCHES);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image"));
    img.src = src;
  });
}

export interface RenderLayer {
  source: CanvasImageSource;
  p: Placement;
}

/** Renders one side of the T-shirt with its layers into a PNG (the preview shown to customer and admin). */
export async function renderPreview(colorHex: string, side: PrintSide, layers: RenderLayer[], scale = 2): Promise<Blob> {
  const shape = SHAPES[side];
  const area = PRINT[side];
  const c = document.createElement("canvas");
  c.width = TEE_W * scale;
  c.height = TEE_H * scale;
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#f3f0ea";
  ctx.fillRect(0, 0, TEE_W, TEE_H);

  const body = new Path2D(shape.body);
  ctx.fillStyle = colorHex;
  ctx.fill(body);
  if (shape.neckInner) {
    ctx.fillStyle = shade(colorHex, 0.22);
    ctx.fill(new Path2D(shape.neckInner));
  }

  // Layers, clipped to the print area
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  for (const l of layers) {
    const b = toBox(side, l.p);
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    ctx.rotate(((l.p.rotation || 0) * Math.PI) / 180);
    ctx.drawImage(l.source, -b.w / 2, -b.h / 2, b.w, b.h);
    ctx.restore();
  }
  ctx.restore();

  // Fabric shading over everything
  ctx.save();
  ctx.clip(body);
  const g = ctx.createLinearGradient(0, 0, TEE_W, 0);
  g.addColorStop(0, "rgba(0,0,0,0.10)");
  g.addColorStop(0.3, "rgba(0,0,0,0)");
  g.addColorStop(0.7, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.10)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEE_W, TEE_H);
  ctx.restore();

  ctx.strokeStyle = shade(colorHex, 0.18);
  ctx.lineWidth = 1.5;
  SEAM_PATHS.forEach((d) => ctx.stroke(new Path2D(d)));
  ctx.lineWidth = 9;
  ctx.strokeStyle = shade(colorHex, 0.1);
  ctx.stroke(new Path2D(shape.collar));
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.stroke(body);

  return canvasToBlob(c);
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the image"))), "image/png"),
  );
}
