/** Editor state for custom T-shirt designs, and converting it to/from what the server stores. */
import { api } from "./api";
import { type TextStyle, renderText } from "./designText";
import { type Source, processImage, rasterizeArt } from "./imageTools";
import { type ViewSpec, VIEWS, canvasToBlob, loadImage, renderPreview } from "./teeMockup";
import type { DesignLayer, DesignSide, Foil, LayerKind, Placement, PrintSide, RosterRow, TextEffect } from "./types";

export interface EditorLayer {
  id: string;
  kind: LayerKind;
  src: string; // what the mockup shows (object URL, data URL or server URL)
  source: Source; // drawn into the previews and uploaded as the print file
  natW: number;
  natH: number;
  p: Placement;
  flip?: boolean;
  file?: Blob; // original file picked on this device, uploaded as-is when unchanged
  url?: string; // already on the server and unchanged
  // Images (upload / AI / art)
  original?: Source; // before background removal / single colour
  bg?: { color: string; tolerance: number } | null;
  single?: { color: string; threshold: number } | null;
  artUrl?: string; // clipart source
  name?: string; // clipart name or AI prompt
  // Text, name, number
  text?: string;
  font?: string;
  color?: string;
  effect?: TextEffect;
  curve?: number;
  outlineColor?: string | null;
  outlineWidth?: number;
  spacing?: number;
  foil?: Foil | null;
}

export type EditorDesign = Record<PrintSide, EditorLayer[]>;

export const emptyDesign = (): EditorDesign => ({ front: [], back: [], left: [], right: [] });
export const printedSides = (d: EditorDesign) => VIEWS.filter((s) => d[s].length > 0);
export const foilSides = (d: EditorDesign) => VIEWS.filter((s) => d[s].some((l) => l.foil));
export const hasKind = (d: EditorDesign, k: LayerKind) => VIEWS.some((s) => d[s].some((l) => l.kind === k));
export const isTextKind = (k: LayerKind) => k === "text" || k === "name" || k === "number";
export const isImageKind = (k: LayerKind) => k === "image" || k === "ai" || k === "art";

let seq = 0;
export const newId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export const sizeOf = (s: Source) => (s instanceof HTMLImageElement ? { w: s.naturalWidth, h: s.naturalHeight } : { w: s.width, h: s.height });

/** Sample shown for name / number layers (the real ones come from the names list). */
export const sampleText = (kind: LayerKind, roster: RosterRow[]) => {
  const first = roster.find((r) => (kind === "name" ? r.name : r.number));
  if (kind === "name") return (first?.name || "YOUR NAME").toUpperCase();
  return first?.number || "10";
};

export const textStyleOf = (l: EditorLayer, text?: string): TextStyle => ({
  text: text ?? l.text ?? "",
  font: l.font || "Anton",
  color: l.color || "#111111",
  effect: l.effect,
  curve: l.curve,
  outlineColor: l.outlineColor,
  outlineWidth: l.outlineWidth,
  spacing: l.spacing,
  foil: l.foil,
});

/** Re-renders a text/name/number layer after a style change; returns the patch (keeps letter size). */
export async function rerenderText(l: EditorLayer, roster: RosterRow[]): Promise<Partial<EditorLayer>> {
  const text = l.kind === "text" ? l.text || " " : sampleText(l.kind, roster);
  const c = await renderText(textStyleOf(l, text));
  return { source: c, src: c.toDataURL(), natW: c.width, natH: c.height, url: undefined, file: undefined };
}

/** Re-applies background removal / single colour to an image layer. */
export async function reprocessImage(l: EditorLayer): Promise<Partial<EditorLayer>> {
  if (l.kind === "art" && l.artUrl) {
    const c = await rasterizeArt(l.artUrl, l.single?.color || null);
    return { source: c, src: c.toDataURL(), natW: c.width, natH: c.height, url: undefined, file: undefined };
  }
  const original = l.original || l.source;
  if (!l.bg && !l.single) {
    const { w, h } = sizeOf(original);
    const src = original instanceof HTMLImageElement ? original.src : (original as HTMLCanvasElement).toDataURL();
    return { source: original, src, natW: w, natH: h };
  }
  const out = processImage(original, { bg: l.bg, single: l.single });
  const { w, h } = sizeOf(out);
  return { source: out, src: (out as HTMLCanvasElement).toDataURL(), natW: w, natH: h, url: undefined, file: undefined };
}

export async function uploadCustom(file: Blob, name: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, name);
  const r = await api<{ url: string }>("/api/custom/uploads", { form });
  return r.url;
}

const extOf = (b: Blob) => (b.type === "image/png" ? "png" : b.type === "image/webp" ? "webp" : "jpg");

export interface SavedDesignResult {
  payload: { sides: DesignSide[]; color_hex: string | null };
  previews: { side: PrintSide; src: string }[];
}

/** Uploads every print file and a preview per printed side; returns what the API expects. */
export async function saveDesign(
  design: EditorDesign, views: Record<PrintSide, ViewSpec>, colorHex: string, photos: Record<string, HTMLImageElement>,
): Promise<SavedDesignResult> {
  const sides: DesignSide[] = [];
  const previews: SavedDesignResult["previews"] = [];
  await Promise.all(printedSides(design).map(async (side) => {
    const layers = design[side];
    const spec = views[side];
    const preview = await renderPreview(spec, colorHex, layers.map((l) => ({ source: l.source, p: l.p, flip: l.flip })), spec.photo ? photos[spec.photo] || null : null);
    const [previewUrl, ...urls] = await Promise.all([
      uploadCustom(preview, "preview.png"),
      ...layers.map(async (l) => {
        if (l.url) return l.url;
        if (l.file) return uploadCustom(l.file, `artwork.${extOf(l.file)}`);
        const blob = l.source instanceof HTMLCanvasElement ? await canvasToBlob(l.source) : await imageToPng(l.source);
        return uploadCustom(blob, `${l.kind}.png`);
      }),
    ]);
    sides.push({
      side,
      preview_url: previewUrl,
      area_cm: { w: spec.cm.w, h: spec.cm.h },
      layers: layers.map((l, i): DesignLayer => ({
        type: l.kind,
        url: urls[i],
        x: l.p.x, y: l.p.y, w: l.p.w, h: l.p.h, rotation: Math.round(l.p.rotation || 0), flip: !!l.flip,
        width: l.natW, height: l.natH,
        ...(isTextKind(l.kind)
          ? { text: l.kind === "text" ? l.text : null, font: l.font, color: l.color, effect: l.effect || "straight", curve: l.curve ?? null,
              outline_color: l.outlineWidth ? l.outlineColor : null, outline_width: l.outlineWidth || 0, spacing: l.spacing || 0 }
          : { background_removed: !!l.bg, single_color: l.single?.color || null, name: l.name?.slice(0, 100) || null }),
        foil: l.foil || null,
      })),
    });
    previews.push({ side, src: URL.createObjectURL(preview) });
  }));
  const order = (s: PrintSide) => VIEWS.indexOf(s);
  sides.sort((a, b) => order(a.side) - order(b.side));
  previews.sort((a, b) => order(a.side) - order(b.side));
  return { payload: { sides, color_hex: /^#[0-9a-f]{6}$/i.test(colorHex) ? colorHex : null }, previews };
}

async function imageToPng(img: HTMLImageElement): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return canvasToBlob(c);
}

/** Rebuilds an editable design from one saved on an order or in "My designs". */
export async function loadDesign(sides: DesignSide[], roster: RosterRow[] = []): Promise<EditorDesign> {
  const d = emptyDesign();
  for (const s of sides) {
    const layers = await Promise.all(s.layers.map(async (l): Promise<EditorLayer> => {
      const p = { x: l.x, y: l.y, w: l.w, h: l.h, rotation: l.rotation || 0 };
      const base = { id: newId(), p, flip: !!l.flip, foil: l.foil || null };
      if (isTextKind(l.type) && l.font) {
        const layer: EditorLayer = {
          ...base, kind: l.type, src: "", source: document.createElement("canvas"), natW: 1, natH: 1,
          text: l.text || "", font: l.font, color: l.color || "#111111", effect: l.effect || "straight", curve: l.curve ?? 40,
          outlineColor: l.outline_color || "#000000", outlineWidth: l.outline_width || 0, spacing: l.spacing || 0,
        };
        return { ...layer, ...(await rerenderText(layer, roster)) };
      }
      const img = await loadImage(l.url);
      return {
        ...base, kind: l.type, src: l.url, source: img, natW: img.naturalWidth, natH: img.naturalHeight, url: l.url, name: l.name || undefined,
      };
    }));
    d[s.side] = layers;
  }
  return d;
}
