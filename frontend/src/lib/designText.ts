/**
 * Text for custom T-shirts (also names and numbers). Text is rendered on the customer's device into a
 * transparent PNG, so what they see is exactly what gets printed (the PNG is also the print file).
 * Effects: straight, arc (curved up/down), circle, bulge, small-to-large, large-to-small.
 */
import type { Foil, TextEffect } from "./types";

export const TEXT_FONTS: { name: string; weight: number; label: string }[] = [
  { name: "Anton", weight: 400, label: "Impact" },
  { name: "Bebas Neue", weight: 400, label: "Sport" },
  { name: "Oswald", weight: 600, label: "Varsity" },
  { name: "Montserrat", weight: 800, label: "Modern" },
  { name: "Inter", weight: 700, label: "Clean" },
  { name: "Playfair Display", weight: 700, label: "Classic" },
  { name: "Bangers", weight: 400, label: "Comic" },
  { name: "Permanent Marker", weight: 400, label: "Marker" },
  { name: "Pacifico", weight: 400, label: "Retro" },
  { name: "Lobster", weight: 400, label: "Bold script" },
  { name: "Great Vibes", weight: 400, label: "Elegant" },
  { name: "Press Start 2P", weight: 400, label: "Pixel" },
];

export const TEXT_COLORS = ["#ffffff", "#111111", "#c39a5c", "#d62828", "#f97316", "#facc15", "#16a34a", "#1d4ed8", "#7c3aed", "#f472b6", "#6b7280", "#7c2d12"];

export const EFFECTS: { id: TextEffect; label: string }[] = [
  { id: "straight", label: "Straight" },
  { id: "arc", label: "Arc" },
  { id: "circle", label: "Circle" },
  { id: "bulge", label: "Bulge" },
  { id: "grow", label: "Small → large" },
  { id: "shrink", label: "Large → small" },
];

export const FOIL_SWATCH: Record<Foil, string> = { gold: "#d4af37", silver: "#c0c0c0" };

export const MAX_TEXT = 40;

const FONT_CSS =
  "https://fonts.googleapis.com/css2?family=Anton&family=Bangers&family=Bebas+Neue&family=Great+Vibes&family=Lobster&family=Montserrat:wght@800&family=Oswald:wght@600&family=Pacifico&family=Permanent+Marker&family=Press+Start+2P&display=swap";

let fontsReady: Promise<void> | null = null;

/** Adds the extra Google Fonts used for T-shirt text (once); resolves when the stylesheet has loaded. */
export function ensureTextFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  fontsReady = new Promise<void>((resolve) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = FONT_CSS;
    l.onload = () => resolve();
    l.onerror = () => resolve(); // offline: fall back to system fonts
    document.head.appendChild(l);
    setTimeout(resolve, 4000);
  });
  return fontsReady;
}

export interface TextStyle {
  text: string;
  font: string;
  color: string;
  effect?: TextEffect;
  curve?: number; // -100..100, for "arc"
  outlineColor?: string | null;
  outlineWidth?: number; // 0..20
  spacing?: number; // -10..60 (% of letter size)
  foil?: Foil | null;
}

export const fontInfo = (name: string) => TEXT_FONTS.find((x) => x.name === name) || TEXT_FONTS[0];
const fontSpec = (name: string, px: number) => `${fontInfo(name).weight} ${px}px "${fontInfo(name).name}"`;

function foilGradient(ctx: CanvasRenderingContext2D, foil: Foil, top: number, bottom: number) {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  const stops = foil === "gold"
    ? ["#8a6d1d", "#f9e27d", "#c9a33a", "#fff3b0", "#a67c1f"]
    : ["#7d7d7d", "#f5f5f5", "#b5b5b5", "#ffffff", "#8a8a8a"];
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

/** Removes transparent borders. */
export function trimCanvas(c: HTMLCanvasElement, pad = 4): HTMLCanvasElement {
  const ctx = c.getContext("2d")!;
  const { width, height } = c;
  const d = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (d[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) {
    const e = document.createElement("canvas");
    e.width = e.height = 1;
    return e;
  }
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** Renders text with its effect into a tight transparent canvas (high resolution, for printing). */
export async function renderText(style: TextStyle): Promise<HTMLCanvasElement> {
  await ensureTextFonts();
  const px = 180;
  const text = style.text || " ";
  try {
    await document.fonts.load(fontSpec(style.font, px), text);
  } catch {
    /* use whatever font is available */
  }
  const effect = style.effect || "straight";
  const chars = [...text];
  const n = chars.length;
  const sizeFactor = (i: number) => {
    const t = n > 1 ? i / (n - 1) : 0.5;
    if (effect === "grow") return 0.55 + 0.9 * t;
    if (effect === "shrink") return 1.45 - 0.9 * t;
    if (effect === "bulge") return 0.6 + 0.75 * Math.sin(Math.PI * ((i + 0.5) / n));
    return 1;
  };
  const m = document.createElement("canvas").getContext("2d")!;
  const spacing = ((style.spacing || 0) / 100) * px;
  const glyphs = chars.map((ch, i) => {
    const size = px * sizeFactor(i);
    m.font = fontSpec(style.font, size);
    const mt = m.measureText(ch);
    return { ch, size, w: mt.width, asc: mt.actualBoundingBoxAscent || size * 0.75, desc: mt.actualBoundingBoxDescent || size * 0.2 };
  });
  const total = glyphs.reduce((s, g) => s + g.w, 0) + spacing * Math.max(0, n - 1);
  const maxAsc = Math.max(...glyphs.map((g) => g.asc));
  const outline = Math.max(0, style.outlineWidth || 0) * (px / 60);

  const curve = effect === "circle" ? 100 : effect === "arc" ? style.curve ?? 40 : 0;
  const theta = effect === "circle" ? Math.PI * 2 * (n / (n + 0.6)) : (Math.abs(curve) / 100) * Math.PI;
  const curved = (effect === "arc" || effect === "circle") && theta > 0.02;
  const radius = curved ? total / theta : 0;
  const margin = px * 1.5 + outline;
  // Canvas just big enough for the text along its arc (gentle curves have a huge radius)
  const half = Math.min(theta / 2, Math.PI / 2);
  const arcW = effect === "circle" ? 2 * radius : theta > Math.PI ? 2 * radius : 2 * radius * Math.sin(half);
  const arcH = effect === "circle" ? 2 * radius : radius * (1 - Math.cos(Math.min(theta / 2, Math.PI)));
  const c = document.createElement("canvas");
  c.width = Math.min(5000, Math.ceil(curved ? arcW + margin * 2 : total + px + outline * 2));
  c.height = Math.min(5000, Math.ceil(curved ? arcH + margin * 2 : px * 2.6 + outline * 2));
  const ctx = c.getContext("2d")!;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  const drawGlyph = (g: (typeof glyphs)[number]) => {
    ctx.font = fontSpec(style.font, g.size);
    if (outline > 0 && style.outlineColor) {
      ctx.strokeStyle = style.outlineColor;
      ctx.lineWidth = outline * 2 * (g.size / px);
      ctx.strokeText(g.ch, -g.w / 2, 0);
    }
    ctx.fillStyle = style.foil ? foilGradient(ctx, style.foil, -g.asc, g.desc) : style.color;
    ctx.fillText(g.ch, -g.w / 2, 0);
  };

  if (!curved) {
    const baseline = c.height / 2 + (effect === "bulge" ? 0 : maxAsc / 2);
    let x = (c.width - total) / 2;
    for (const g of glyphs) {
      ctx.save();
      // Bulge letters grow from the middle line; others sit on the baseline
      const y = effect === "bulge" ? baseline + (g.asc - g.desc) / 2 : baseline;
      ctx.translate(x + g.w / 2, y);
      drawGlyph(g);
      ctx.restore();
      x += g.w + spacing;
    }
  } else {
    const cx = c.width / 2;
    const up = curve >= 0; // arc up (rainbow) or down (smile)
    // Circle: centred. Arc up: top of the circle near the top edge. Arc down: bottom of the circle near the bottom edge.
    const cy = effect === "circle" ? c.height / 2 : up ? margin + radius : c.height - margin - radius;
    let pos = -total / 2;
    for (const g of glyphs) {
      const mid = pos + g.w / 2;
      const phi = mid / radius; // angle from the top (or bottom) of the circle
      ctx.save();
      if (up) {
        ctx.translate(cx + radius * Math.sin(phi), cy - radius * Math.cos(phi));
        ctx.rotate(phi);
      } else {
        ctx.translate(cx + radius * Math.sin(phi), cy + radius * Math.cos(phi));
        ctx.rotate(-phi);
        ctx.translate(0, g.asc * 0.9); // letters hang from the curve
      }
      drawGlyph(g);
      ctx.restore();
      pos += g.w + spacing;
    }
  }
  return trimCanvas(c);
}
