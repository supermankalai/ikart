import { createContext, useContext } from "react";
import type { EditorDesign, EditorLayer } from "../../lib/designState";
import type { ViewSpec } from "../../lib/teeMockup";
import type { CustomConfig, CustomProduct, PrintSide, RosterRow, StoreSettings } from "../../lib/types";

export type Tool = "product" | "upload" | "text" | "art" | "ai" | "names" | "layers";

export interface DesignerApi {
  design: EditorDesign;
  view: PrintSide;
  setView(v: PrintSide): void;
  spec: ViewSpec;
  views: Record<PrintSide, ViewSpec>;
  products: CustomProduct[];
  product: CustomProduct;
  setProduct(p: CustomProduct): void;
  color: string;
  colorHex: string;
  setColor(name: string): void;
  active: EditorLayer | null;
  select(id: string | null): void;
  setTool(t: Tool): void;
  /** Adds a layer to the current view (or `view`) and selects it */
  add(layer: EditorLayer, view?: PrintSide): void;
  /** Changes a layer; changes with the same `group` merge into one undo step */
  patch(id: string, patch: Partial<EditorLayer>, group?: string): void;
  /** Changes text style / image effects, then re-renders the layer */
  restyle(id: string, patch: Partial<EditorLayer>, group?: string): void;
  remove(id: string): void;
  duplicate(id: string): void;
  reorder(id: string, dir: 1 | -1): void;
  roster: RosterRow[];
  setRoster(r: RosterRow[]): void;
  sizes: string[];
  requireAuth(fn: () => void): void;
  settings: StoreSettings;
  config: CustomConfig | null;
  setConfig(c: CustomConfig): void;
  locked: boolean; // redesign mode: product, colour and sizes can't change
}

export const DesignerCtx = createContext<DesignerApi | null>(null);
export const useDesigner = () => useContext(DesignerCtx)!;
