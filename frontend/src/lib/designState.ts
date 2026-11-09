/** Editor state for custom T-shirt designs, and converting it to/from what the server stores. */
import { api } from "./api";
import { renderText } from "./designText";
import { canvasToBlob, loadImage, renderPreview } from "./teeMockup";
import type { DesignLayer, DesignSide, Placement, PrintSide } from "./types";

export const SIDES: PrintSide[] = ["front", "back"];

export interface EditorLayer {
  id: string;
  kind: "image" | "text";
  src: string; // what the mockup shows (object URL, data URL or server URL)
  source: HTMLImageElement | HTMLCanvasElement; // drawn into the preview
  natW: number;
  natH: number;
  p: Placement;
  file?: Blob; // image picked on this device, not uploaded yet
  url?: string; // image already on the server
  text?: string;
  font?: string;
  color?: string;
}

export type EditorDesign = Record<PrintSide, EditorLayer[]>;

export const emptyDesign = (): EditorDesign => ({ front: [], back: [] });
export const printedSides = (d: EditorDesign) => SIDES.filter((s) => d[s].length > 0);

let seq = 0;
export const newId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function uploadCustom(file: Blob, name: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, name);
  const r = await api<{ url: string }>("/api/custom/uploads", { form });
  return r.url;
}

const extOf = (b: Blob) => (b.type === "image/png" ? "png" : b.type === "image/webp" ? "webp" : "jpg");

export interface SavedDesign {
  payload: { sides: DesignSide[]; color_hex: string | null };
  previews: { side: PrintSide; src: string }[];
}

/** Uploads print files and per-side previews; returns what the order API expects. */
export async function saveDesign(design: EditorDesign, colorHex: string): Promise<SavedDesign> {
  const sides: DesignSide[] = [];
  const previews: SavedDesign["previews"] = [];
  for (const side of printedSides(design)) {
    const layers = design[side];
    const [preview, ...files] = await Promise.all([
      renderPreview(colorHex, side, layers.map((l) => ({ source: l.source, p: l.p }))),
      ...layers.map((l) => (l.kind === "text" ? canvasToBlob(l.source as HTMLCanvasElement) : Promise.resolve(l.file ?? null))),
    ]);
    const [previewUrl, ...urls] = await Promise.all([
      uploadCustom(preview, "preview.png"),
      ...layers.map((l, i) => {
        const f = files[i];
        if (l.kind === "image" && l.url && !f) return Promise.resolve(l.url);
        return uploadCustom(f as Blob, l.kind === "text" ? "text.png" : `artwork.${extOf(f as Blob)}`);
      }),
    ]);
    sides.push({
      side,
      preview_url: previewUrl,
      layers: layers.map((l, i): DesignLayer => ({
        type: l.kind,
        url: urls[i],
        x: l.p.x, y: l.p.y, w: l.p.w, h: l.p.h, rotation: Math.round(l.p.rotation || 0),
        width: l.natW, height: l.natH,
        ...(l.kind === "text" ? { text: l.text, font: l.font, color: l.color } : {}),
      })),
    });
    previews.push({ side, src: URL.createObjectURL(preview) });
  }
  return { payload: { sides, color_hex: /^#[0-9a-f]{6}$/i.test(colorHex) ? colorHex : null }, previews };
}

/** Rebuilds an editable design from one saved on an order (for "upload a new design"). */
export async function loadDesign(sides: DesignSide[]): Promise<EditorDesign> {
  const d = emptyDesign();
  for (const s of sides) {
    for (const l of s.layers) {
      const p = { x: l.x, y: l.y, w: l.w, h: l.h, rotation: l.rotation || 0 };
      if (l.type === "text" && l.text && l.font && l.color) {
        const c = await renderText(l.text, l.font, l.color);
        d[s.side].push({ id: newId(), kind: "text", src: c.toDataURL(), source: c, natW: c.width, natH: c.height, p, text: l.text, font: l.font, color: l.color });
      } else {
        const img = await loadImage(l.url);
        d[s.side].push({ id: newId(), kind: "image", src: l.url, source: img, natW: img.naturalWidth, natH: img.naturalHeight, p, url: l.url });
      }
    }
  }
  return d;
}
