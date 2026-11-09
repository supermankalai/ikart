/**
 * Text for custom T-shirts. Text is rendered on the customer's device into a transparent PNG,
 * so what they see is exactly what gets printed (the PNG is also the print file).
 */
export const TEXT_FONTS: { name: string; weight: number; label: string }[] = [
  { name: "Inter", weight: 700, label: "Clean" },
  { name: "Playfair Display", weight: 700, label: "Classic" },
  { name: "Anton", weight: 400, label: "Bold" },
  { name: "Bebas Neue", weight: 400, label: "Sport" },
  { name: "Pacifico", weight: 400, label: "Script" },
  { name: "Permanent Marker", weight: 400, label: "Marker" },
];

export const TEXT_COLORS = ["#ffffff", "#111111", "#c39a5c", "#d62828", "#1d4ed8", "#facc15", "#16a34a", "#f472b6"];

export const MAX_TEXT = 40;

const FONT_CSS =
  "https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Pacifico&family=Permanent+Marker&display=swap";

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

const fontSpec = (name: string, px: number) => {
  const f = TEXT_FONTS.find((x) => x.name === name) || TEXT_FONTS[0];
  return `${f.weight} ${px}px "${f.name}"`;
};

/** Renders a line of text into a tight transparent canvas (high resolution, for printing). */
export async function renderText(text: string, font: string, color: string): Promise<HTMLCanvasElement> {
  const px = 220;
  const spec = fontSpec(font, px);
  await ensureTextFonts();
  try {
    await document.fonts.load(spec, text);
  } catch {
    /* fall back to whatever font is available */
  }
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = spec;
  const m = measure.measureText(text);
  const ascent = m.actualBoundingBoxAscent || px * 0.8;
  const descent = m.actualBoundingBoxDescent || px * 0.2;
  const left = m.actualBoundingBoxLeft || 0;
  const width = Math.max(1, (m.actualBoundingBoxRight || m.width) + left);
  const pad = Math.round(px * 0.08);
  const c = document.createElement("canvas");
  c.width = Math.ceil(width + pad * 2);
  c.height = Math.ceil(ascent + descent + pad * 2);
  const ctx = c.getContext("2d")!;
  ctx.font = spec;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, pad + left, pad + ascent);
  return c;
}
