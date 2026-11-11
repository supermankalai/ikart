/**
 * Mockup geometry for the T-shirt designer. A "view" is what the customer designs on: the front, back or
 * a sleeve. Each view is either a drawn T-shirt (vector, recoloured to the shirt colour) or a real product
 * photo uploaded by the admin, plus the printable area on it. One definition drives the on-screen editor
 * (SVG) and the final preview images (canvas), so they always match.
 */
import type { CustomMockups, Placement, PrintSide } from "./types";

export const VIEWS: PrintSide[] = ["front", "back", "left", "right"];

/** Drawn T-shirt coordinate space */
export const TEE_W = 500;
export const TEE_H = 560;

const BODY = "L392 66 L478 158 L424 210 L392 182 L396 528 Q250 540 104 528 L108 182 L76 210 L22 158 L108 66 Z";
export const SHAPES = {
  front: {
    body: `M185 38 C200 80 300 80 315 38 ${BODY}`,
    neckInner: "M185 38 C210 54 290 54 315 38 C300 80 200 80 185 38 Z" as string | null,
    collar: "M185 38 C200 80 300 80 315 38",
  },
  back: {
    body: `M185 38 C210 54 290 54 315 38 ${BODY}`,
    neckInner: null as string | null,
    collar: "M185 38 C210 54 290 54 315 38",
  },
  // A short sleeve seen from the side (used for the sleeve views): shoulder seam at the top, hem at the bottom
  sleeve: {
    body: "M150 110 Q250 86 350 110 L404 410 Q250 436 96 410 Z",
    neckInner: null as string | null,
    collar: "M104 384 Q250 410 396 384",
  },
};
const TEE_SEAMS = ["M120 70 Q112 128 108 182", "M380 70 Q388 128 392 182", "M31 151 L83 201", "M469 151 L417 201"];
const SLEEVE_SEAMS = ["M150 110 Q250 86 350 110"];
export const seamsFor = (shape: keyof typeof SHAPES) => (shape === "sleeve" ? SLEEVE_SEAMS : TEE_SEAMS);

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewSpec {
  view: PrintSide;
  /** Real product photo, or null for the drawn T-shirt */
  photo: string | null;
  shape: keyof typeof SHAPES;
  baseW: number;
  baseH: number;
  /** Visible part of the base (crop), in base coordinates */
  box: Rect;
  /** Printable area, in base coordinates */
  area: Rect;
  /** Real size of the printable area */
  cm: { w: number; h: number };
}

const DRAWN: Record<PrintSide, Omit<ViewSpec, "view" | "photo">> = {
  front: { shape: "front", baseW: TEE_W, baseH: TEE_H, box: { x: 0, y: 0, w: TEE_W, h: TEE_H }, area: { x: 165, y: 112, w: 170, h: 226 }, cm: { w: 30, h: 40 } },
  back: { shape: "back", baseW: TEE_W, baseH: TEE_H, box: { x: 0, y: 0, w: TEE_W, h: TEE_H }, area: { x: 165, y: 96, w: 170, h: 226 }, cm: { w: 30, h: 40 } },
  left: { shape: "sleeve", baseW: TEE_W, baseH: TEE_H, box: { x: 60, y: 60, w: 380, h: 400 }, area: { x: 190, y: 170, w: 120, h: 120 }, cm: { w: 9, h: 9 } },
  right: { shape: "sleeve", baseW: TEE_W, baseH: TEE_H, box: { x: 60, y: 60, w: 380, h: 400 }, area: { x: 190, y: 170, w: 120, h: 120 }, cm: { w: 9, h: 9 } },
};

const DEFAULT_PHOTO_AREA: Record<PrintSide, Rect> = {
  front: { x: 0.3, y: 0.24, w: 0.4, h: 0.48 },
  back: { x: 0.3, y: 0.2, w: 0.4, h: 0.5 },
  left: { x: 0.38, y: 0.38, w: 0.24, h: 0.24 },
  right: { x: 0.38, y: 0.38, w: 0.24, h: 0.24 },
};

/**
 * Views for a product + colour. `photoSizes` holds the natural size of photos that have loaded;
 * until a photo has loaded its view uses the drawn T-shirt.
 */
export function buildViews(m: CustomMockups | null | undefined, color: string, photoSizes: Record<string, { w: number; h: number }>): Record<PrintSide, ViewSpec> {
  const out = {} as Record<PrintSide, ViewSpec>;
  for (const v of VIEWS) {
    const photo = m?.photos?.[color]?.[v];
    const size = photo ? photoSizes[photo] : undefined;
    const conf = m?.views?.[v];
    if (photo && size) {
      const a = conf?.area || DEFAULT_PHOTO_AREA[v];
      out[v] = {
        view: v, photo, shape: v === "back" ? "back" : v === "front" ? "front" : "sleeve", baseW: size.w, baseH: size.h,
        box: { x: 0, y: 0, w: size.w, h: size.h },
        area: { x: a.x * size.w, y: a.y * size.h, w: a.w * size.w, h: a.h * size.h },
        cm: conf?.cm || DRAWN[v].cm,
      };
    } else {
      out[v] = { view: v, photo: null, ...DRAWN[v] };
    }
  }
  return out;
}

/** All photo URLs of a product colour (to preload). */
export const photoUrls = (m: CustomMockups | null | undefined, color: string) =>
  Object.values(m?.photos?.[color] || {}).filter(Boolean) as string[];

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

/** Placement that fits a w×h item in the print area at `maxWidth` of its width, centred, top at `top`. */
export function fitPlacement(spec: ViewSpec, imgW: number, imgH: number, maxWidth = 0.8, top?: number): Placement {
  const a = spec.area;
  const aspect = imgH / imgW;
  let w = a.w * maxWidth;
  let h = w * aspect;
  if (h > a.h * 0.8) {
    h = a.h * 0.8;
    w = h / aspect;
  }
  const y = top ?? (a.h - h) / 2 / a.h;
  return { x: (a.w - w) / 2 / a.w, y, w: w / a.w, h: h / a.h, rotation: 0 };
}

/** Scale an item around its centre to `widthFraction` of the print-area width (keeps its shape). */
export function resizePlacement(p: Placement, widthFraction: number): Placement {
  const ratio = widthFraction / p.w;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const h = p.h * ratio;
  return { ...p, x: cx - widthFraction / 2, y: cy - h / 2, w: widthFraction, h };
}

/** Keep the item's height (letter size) and centre, but give it a new aspect ratio (after re-rendering text). */
export function reshapePlacement(p: Placement, spec: ViewSpec, natW: number, natH: number): Placement {
  const hPx = p.h * spec.area.h;
  const w = (hPx * (natW / natH)) / spec.area.w;
  const cx = p.x + p.w / 2;
  return { ...p, x: cx - w / 2, w };
}

/** 3×3 alignment inside the print area. */
export function alignPlacement(p: Placement, h: "left" | "center" | "right", v: "top" | "middle" | "bottom"): Placement {
  const x = h === "left" ? 0 : h === "right" ? 1 - p.w : (1 - p.w) / 2;
  const y = v === "top" ? 0 : v === "bottom" ? 1 - p.h : (1 - p.h) / 2;
  return { ...p, x, y };
}

/** Item box in base coordinates. */
export function toBox(spec: ViewSpec, p: Placement): Rect {
  const a = spec.area;
  return { x: a.x + p.x * a.w, y: a.y + p.y * a.h, w: p.w * a.w, h: p.h * a.h };
}

/** Real printed size of an item. */
export function printSizeCm(spec: ViewSpec, p: Placement) {
  return { w: p.w * spec.cm.w, h: p.h * spec.cm.h };
}

/** Approximate print resolution (dots per inch) of an image at its current size. */
export function printDpi(spec: ViewSpec, imgW: number, p: Placement): number {
  return imgW / ((p.w * spec.cm.w) / 2.54);
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
  flip?: boolean;
}

/** Draws the base (drawn T-shirt or photo) of a view. Coordinates: base space. */
function drawBase(ctx: CanvasRenderingContext2D, spec: ViewSpec, colorHex: string, photo: HTMLImageElement | null, layer: "under" | "over") {
  if (spec.photo) {
    if (layer === "under" && photo) ctx.drawImage(photo, 0, 0, spec.baseW, spec.baseH);
    return;
  }
  const shape = SHAPES[spec.shape];
  const body = new Path2D(shape.body);
  if (layer === "under") {
    ctx.fillStyle = colorHex;
    ctx.fill(body);
    if (shape.neckInner) {
      ctx.fillStyle = shade(colorHex, 0.22);
      ctx.fill(new Path2D(shape.neckInner));
    }
    return;
  }
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
  seamsFor(spec.shape).forEach((d) => ctx.stroke(new Path2D(d)));
  ctx.lineWidth = 9;
  ctx.strokeStyle = shade(colorHex, 0.1);
  ctx.stroke(new Path2D(shape.collar));
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.stroke(body);
}

/** Clips to the printable part of a view: the whole garment (drawn T-shirt) or the whole photo. */
function clipGarment(ctx: CanvasRenderingContext2D, spec: ViewSpec) {
  if (spec.photo) {
    ctx.beginPath();
    ctx.rect(0, 0, spec.baseW, spec.baseH);
    ctx.clip();
  } else ctx.clip(new Path2D(SHAPES[spec.shape].body));
}

function drawLayers(ctx: CanvasRenderingContext2D, spec: ViewSpec, layers: RenderLayer[]) {
  for (const l of layers) {
    const b = toBox(spec, l.p);
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    ctx.rotate(((l.p.rotation || 0) * Math.PI) / 180);
    if (l.flip) ctx.scale(-1, 1);
    ctx.drawImage(l.source, -b.w / 2, -b.h / 2, b.w, b.h);
    ctx.restore();
  }
}

/** A sleeve design to show on the front/back of the drawn T-shirt (360° view). */
export interface SleeveArt {
  spec: ViewSpec;
  layers: RenderLayer[];
  /** Which sleeve of the drawn T-shirt (as seen in that view) it goes on */
  on: "left" | "right";
}

/**
 * Draws a sleeve design onto a sleeve of the drawn front/back T-shirt. The sleeve view looks at the sleeve
 * from the side, so its centre line lies on the sleeve's top fold: one half shows on the front, the other
 * on the back (the caller's garment clip cuts off the half that belongs to the other face).
 */
function drawSleeveArt(ctx: CanvasRenderingContext2D, art: SleeveArt) {
  if (!art.layers.length) return;
  const { box } = art.spec;
  const k = 0.42 * (400 / box.h); // sleeve view → T-shirt scale
  const right = art.on === "right";
  const ax = right ? 392 : 108; // shoulder end of the sleeve's top edge
  const ay = 66;
  const dx = (right ? 1 : -1) * 0.683; // along the sleeve, shoulder → cuff
  const dy = 0.73;
  const ex = 0.73; // around the sleeve
  const ey = right ? -0.683 : 0.683;
  const ox = box.x + box.w / 2;
  const oy = box.y + box.h * 0.125;
  ctx.save();
  ctx.transform(k * ex, k * ey, k * dx, k * dy, ax - k * (ex * ox + dx * oy), ay - k * (ey * ox + dy * oy));
  drawLayers(ctx, art.spec, art.layers);
  ctx.restore();
}

/** Paints one view (garment + design) in base coordinates. The design can sit anywhere on the garment. */
export function paintView(
  ctx: CanvasRenderingContext2D, spec: ViewSpec, colorHex: string, layers: RenderLayer[], photo: HTMLImageElement | null = null, sleeves: SleeveArt[] = [],
) {
  drawBase(ctx, spec, colorHex, photo, "under");
  ctx.save();
  clipGarment(ctx, spec);
  drawLayers(ctx, spec, layers);
  if (!spec.photo) sleeves.forEach((s) => drawSleeveArt(ctx, s));
  ctx.restore();
  drawBase(ctx, spec, colorHex, photo, "over");
}

/** Renders one view with its layers into a PNG (the preview shown to customer and admin). */
export async function renderPreview(spec: ViewSpec, colorHex: string, layers: RenderLayer[], photo: HTMLImageElement | null = null, width = 1000): Promise<Blob> {
  const scale = width / spec.box.w;
  const c = document.createElement("canvas");
  c.width = Math.round(spec.box.w * scale);
  c.height = Math.round(spec.box.h * scale);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f3f0ea";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(scale, scale);
  ctx.translate(-spec.box.x, -spec.box.y);
  paintView(ctx, spec, colorHex, layers, photo);
  return canvasToBlob(c);
}

export function canvasToBlob(c: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the image"))), type),
  );
}
