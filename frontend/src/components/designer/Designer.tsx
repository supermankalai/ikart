import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/auth";
import { useStore } from "../../context/store";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import {
  type EditorDesign, type EditorLayer, type SavedDesignResult, emptyDesign, foilSides, hasKind, isImageKind, isTextKind, newId,
  printedSides, reprocessImage, rerenderText, saveDesign,
} from "../../lib/designState";
import { SIDE_LABEL, money } from "../../lib/format";
import { sortSizes } from "../../lib/sizes";
import { VIEWS, alignPlacement, buildViews, loadImage, photoUrls, reshapePlacement, resizePlacement } from "../../lib/teeMockup";
import { useHistory } from "../../lib/useHistory";
import type { CustomConfig, CustomProduct, CustomQuote, PrintSide, RosterRow, SavedDesign } from "../../lib/types";
import AuthModal from "../AuthModal";
import Icon from "../Icon";
import { Modal } from "../ui";
import AiPanel from "./AiPanel";
import ArtPanel from "./ArtPanel";
import { type DesignerApi, DesignerCtx, type Tool } from "./context";
import DesignCanvas from "./DesignCanvas";
import LayersPanel from "./LayersPanel";
import NamesPanel from "./NamesPanel";
import ProductPanel, { ColorSwatches } from "./ProductPanel";
import TextPanel from "./TextPanel";
import UploadPanel from "./UploadPanel";

export interface DesignerInitial {
  productId?: number | null;
  color?: string | null;
  design?: EditorDesign;
  roster?: RosterRow[] | null;
  sizes?: Record<string, number>;
  glow?: boolean;
  saved?: { id: number; token: string; name: string } | null;
}

export interface DesignerResult {
  product: CustomProduct;
  color: string;
  colorHex: string;
  saved: SavedDesignResult;
  lines: { variant_id: number; quantity: number }[];
  roster: RosterRow[] | null;
  glow: boolean;
  quote: CustomQuote | null;
}

/** Redesign mode: what the paid order allows. */
export interface DesignRules {
  sides: PrintSide[];
  foilSides: PrintSide[];
  name: boolean;
  number: boolean;
}

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "product", label: "T-shirt", icon: "shirt" },
  { id: "upload", label: "Upload", icon: "upload" },
  { id: "text", label: "Text", icon: "text" },
  { id: "art", label: "Art", icon: "star" },
  { id: "ai", label: "AI image", icon: "sparkles" },
  { id: "names", label: "Name & no.", icon: "hash" },
  { id: "layers", label: "Layers", icon: "layers" },
];

const toolFor = (l: EditorLayer): Tool =>
  l.kind === "text" ? "text" : l.kind === "art" ? "art" : l.kind === "ai" ? "ai" : l.kind === "image" ? "upload" : "names";

export default function Designer({
  products,
  initial,
  rules,
  onContinue,
  continueLabel = "Continue",
  banner,
}: {
  products: CustomProduct[];
  initial?: DesignerInitial;
  rules?: DesignRules;
  onContinue(r: DesignerResult): Promise<void> | void;
  continueLabel?: string;
  banner?: ReactNode;
}) {
  const { settings } = useStore();
  const { user } = useAuth();
  const toast = useToast();
  const locked = !!rules;

  const [product, setProductState] = useState<CustomProduct>(() => products.find((p) => p.id === initial?.productId) || products[0]);
  const firstColor = (p: CustomProduct) => p.variants.find((v) => v.stock > 0)?.color || p.variants[0]?.color || "";
  const [color, setColorState] = useState(() => (initial?.color && product.variants.some((v) => v.color === initial.color) ? initial.color : firstColor(product)));
  const hist = useHistory<EditorDesign>(initial?.design || emptyDesign);
  const design = hist.state;
  const [view, setView] = useState<PrintSide>(() => printedSides(initial?.design || emptyDesign())[0] || "front");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>(initial?.design && printedSides(initial.design).length ? "layers" : "upload");
  const [roster, setRosterState] = useState<RosterRow[]>(initial?.roster || []);
  const [qty, setQty] = useState<Record<string, number>>(initial?.sizes || {});
  const [glow, setGlow] = useState(!!initial?.glow);
  const [photos, setPhotos] = useState<Record<string, HTMLImageElement>>({});
  const [config, setConfig] = useState<CustomConfig | null>(null);
  const [quote, setQuote] = useState<CustomQuote | null>(null);
  const [quoteErr, setQuoteErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [auth, setAuth] = useState<{ fn: () => void } | null>(null);
  const [saved, setSaved] = useState(initial?.saved || null);
  const [savedVersion, setSavedVersion] = useState(-1);
  const [version, setVersion] = useState(0);
  const [saveOpen, setSaveOpen] = useState<null | "save" | "share">(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const rosterRef = useRef(roster);
  rosterRef.current = roster;

  useEffect(() => setVersion((v) => v + 1), [design, roster, qty, glow, color, product]);

  // Photo mockups for this colour
  useEffect(() => {
    for (const url of photoUrls(product.custom_mockups, color)) {
      if (photos[url]) continue;
      loadImage(url).then((img) => setPhotos((m) => ({ ...m, [url]: img }))).catch(() => {});
    }
  }, [product, color, photos]);
  const photoSizes = useMemo(() => Object.fromEntries(Object.entries(photos).map(([u, i]) => [u, { w: i.naturalWidth, h: i.naturalHeight }])), [photos]);
  const views = useMemo(() => buildViews(product.custom_mockups, color, photoSizes), [product, color, photoSizes]);
  const spec = views[view];
  const colorHex = product.variants.find((v) => v.color === color)?.color_hex || "#ffffff";

  useEffect(() => {
    api<CustomConfig>("/api/custom/config").then(setConfig).catch(() => {});
  }, [user]);

  // ---------- Layer actions ----------
  const where = (d: EditorDesign, id: string) => {
    for (const v of VIEWS) {
      const l = d[v].find((x) => x.id === id);
      if (l) return { v, l };
    }
    return null;
  };
  const allLayers = VIEWS.flatMap((v) => design[v]);
  const active = allLayers.find((l) => l.id === activeId) || null;

  const select = useCallback((id: string | null) => {
    setActiveId(id);
    if (!id) return;
    const w = where(hist.current.current, id);
    if (w) {
      setView(w.v);
      setTool(toolFor(w.l));
    }
  }, [hist]);

  const add = useCallback((layer: EditorLayer, v?: PrintSide) => {
    const target = v || view;
    if (hist.current.current[target].length >= 12) return toast("You can add up to 12 items per side", "error");
    hist.set((d) => ({ ...d, [target]: [...d[target], layer] }));
    setActiveId(layer.id);
    setTool(toolFor(layer));
  }, [hist, view, toast]);

  const patch = useCallback((id: string, p: Partial<EditorLayer>, group?: string) => {
    hist.set((d) => {
      const w = where(d, id);
      if (!w) return d;
      return { ...d, [w.v]: d[w.v].map((l) => (l.id === id ? { ...l, ...p } : l)) };
    }, group ?? null);
  }, [hist]);

  const timers = useRef<Record<string, number>>({});
  const tokens = useRef<Record<string, number>>({});
  const rerender = useCallback((id: string) => {
    window.clearTimeout(timers.current[id]);
    timers.current[id] = window.setTimeout(async () => {
      const w = where(hist.current.current, id);
      if (!w) return;
      const token = (tokens.current[id] || 0) + 1;
      tokens.current[id] = token;
      try {
        const r = isTextKind(w.l.kind) ? await rerenderText(w.l, rosterRef.current) : await reprocessImage(w.l);
        if (tokens.current[id] !== token) return;
        hist.replace((d) => {
          const cur = where(d, id);
          if (!cur) return d;
          const p = isTextKind(cur.l.kind) && r.natW && r.natH ? reshapePlacement(cur.l.p, views[cur.v], r.natW, r.natH) : cur.l.p;
          return { ...d, [cur.v]: d[cur.v].map((l) => (l.id === id ? { ...l, ...r, p } : l)) };
        });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }, isTextKind(where(hist.current.current, id)?.l.kind || "text") ? 120 : 60);
  }, [hist, views, toast]);

  const restyle = useCallback((id: string, p: Partial<EditorLayer>, group?: string) => {
    patch(id, p, group);
    rerender(id);
  }, [patch, rerender]);

  const remove = useCallback((id: string) => {
    hist.set((d) => {
      const w = where(d, id);
      return w ? { ...d, [w.v]: d[w.v].filter((l) => l.id !== id) } : d;
    });
    setActiveId(null);
  }, [hist]);

  const duplicate = useCallback((id: string) => {
    const w = where(hist.current.current, id);
    if (!w) return;
    if (w.l.kind === "name" || w.l.kind === "number") return toast("Each T-shirt can have one name and one number", "error");
    const copy = { ...w.l, id: newId(), p: { ...w.l.p, x: w.l.p.x + 0.05, y: w.l.p.y + 0.05 } };
    add(copy, w.v);
  }, [hist, add, toast]);

  const reorder = useCallback((id: string, dir: 1 | -1) => {
    hist.set((d) => {
      const w = where(d, id);
      if (!w) return d;
      const list = [...d[w.v]];
      const i = list.findIndex((l) => l.id === id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return d;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...d, [w.v]: list };
    });
  }, [hist]);

  // Name/number previews show the first row of the names list
  const sampleKey = `${roster.find((r) => r.name)?.name || ""}|${roster.find((r) => r.number)?.number || ""}`;
  useEffect(() => {
    allLayers.filter((l) => l.kind === "name" || l.kind === "number").forEach((l) => rerender(l.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleKey]);

  const requireAuth = useCallback((fn: () => void) => (user ? fn() : setAuth({ fn })), [user]);

  // ---------- Product, colour, sizes ----------
  const setProduct = (p: CustomProduct) => {
    setProductState(p);
    setColorState((c) => (p.variants.some((v) => v.color === c && v.stock > 0) ? c : firstColor(p)));
    setQty({});
  };
  const colorVariants = product.variants.filter((v) => v.color === color);
  const sizes = sortSizes(colorVariants.map((v) => v.size));
  const variantOf = (size: string) => colorVariants.find((v) => v.size === size);
  const personalised = hasKind(design, "name") || hasKind(design, "number");
  const sides = printedSides(design);
  const foil = foilSides(design);

  const lines = useMemo(() => {
    const counts: Record<string, number> = {};
    if (personalised) roster.forEach((r) => (counts[r.size] = (counts[r.size] || 0) + 1));
    else Object.entries(qty).forEach(([s, n]) => n > 0 && (counts[s] = n));
    return Object.entries(counts).map(([s, n]) => ({ variant_id: variantOf(s)?.id ?? 0, quantity: n })).filter((l) => l.variant_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalised, roster, qty, color, product]);
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);

  // Default: one T-shirt in a middle size so the price shows straight away
  useEffect(() => {
    if (locked || personalised || Object.values(qty).some((n) => n > 0) || !sizes.length) return;
    const pick = sizes.find((s) => s === "M" && (variantOf(s)?.stock || 0) > 0) || sizes.find((s) => (variantOf(s)?.stock || 0) > 0);
    if (pick) setQty({ [pick]: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, product]);

  const quoteKey = JSON.stringify([lines, sides, foil, hasKind(design, "name"), hasKind(design, "number"), glow]);
  useEffect(() => {
    if (locked) return;
    if (!sides.length || !lines.length) {
      setQuote(null);
      setQuoteErr("");
      return;
    }
    const t = setTimeout(() => {
      api<CustomQuote>("/api/custom/quote", {
        body: { lines, sides, foil_sides: foil, name: hasKind(design, "name"), number: hasKind(design, "number"), glow },
      })
        .then((q) => { setQuote(q); setQuoteErr(""); })
        .catch((e) => { setQuote(null); setQuoteErr(e.message); });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, locked]);

  // ---------- Keyboard shortcuts ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); hist.redo(); return; }
      if (!active) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(active.id); }
      else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(active.id); }
      else if (e.key === "Escape") setActiveId(null);
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.02 : 0.004;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        patch(active.id, { p: { ...active.p, x: active.p.x + dx, y: active.p.y + dy } }, `nudge-${active.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, hist, remove, duplicate, patch]);

  // ---------- Save / share / continue ----------
  const upload = () => saveDesign(design, views, colorHex, photos);

  const rulesProblem = (() => {
    if (!rules) return "";
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    if (!same(sides, rules.sides)) return `Your order includes printing on: ${rules.sides.map((s) => SIDE_LABEL[s].toLowerCase()).join(", ")}. Please design exactly those side(s).`;
    if (!same(foil, rules.foilSides)) return rules.foilSides.length ? `Keep gold/silver foil on: ${rules.foilSides.map((s) => SIDE_LABEL[s].toLowerCase()).join(", ")}.` : "Gold/silver foil wasn't part of your order. Please use a normal colour.";
    if (hasKind(design, "name") !== rules.name || hasKind(design, "number") !== rules.number) return "Keep the name / number exactly as in your order.";
    return "";
  })();

  const doContinue = () => {
    if (!sides.length) return toast("Add an image, text or art to the T-shirt first", "error");
    if (rulesProblem) return toast(rulesProblem, "error");
    if (!locked) {
      if (personalised) {
        if (!roster.length) return toast("Add at least one T-shirt to the names list", "error");
        const missing = roster.findIndex((r) => (hasKind(design, "name") && !r.name?.trim()) || (hasKind(design, "number") && !r.number?.trim()));
        if (missing >= 0) { setTool("names"); return toast(`Row ${missing + 1} in the names list is incomplete`, "error"); }
      } else if (!totalQty) return toast("Choose at least one size", "error");
      if (!quote) return toast(quoteErr || "Please wait for the price", "error");
      if (quote.has_issues) return toast(quote.lines.filter((l) => l.issue).map((l) => `${l.size}: ${l.issue}`).join("; "), "error");
    }
    requireAuth(async () => {
      setBusy(true);
      try {
        const s = await upload();
        await onContinue({ product, color, colorHex, saved: s, lines, roster: personalised ? roster : null, glow, quote });
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setBusy(false);
      }
    });
  };

  const saveToAccount = async (name: string, then: "save" | "share") => {
    setBusy(true);
    try {
      const s = await upload();
      const body = { name, product_id: product.id, color, design: s.payload, roster: personalised ? roster : null, sizes: qty, glow };
      const r = saved
        ? await api<SavedDesign>(`/api/custom/designs/${saved.id}`, { method: "PUT", body })
        : await api<SavedDesign>("/api/custom/designs", { body });
      setSaved({ id: r.id, token: r.token, name: r.name });
      setSavedVersion(version);
      setSaveOpen(null);
      if (then === "share") setShareOpen(true);
      else toast("Design saved to My designs", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const askSave = (then: "save" | "share") => {
    if (!sides.length) return toast("Add something to the T-shirt first", "error");
    requireAuth(() => (then === "share" && saved && savedVersion === version ? setShareOpen(true) : setSaveOpen(then)));
  };

  // ---------- Context API ----------
  const api_: DesignerApi = {
    design, view, setView: (v) => { setView(v); setActiveId(null); }, spec, views, products, product, setProduct, color, colorHex,
    setColor: (c) => setColorState(c), active, select, setTool, add, patch, restyle, remove, duplicate, reorder,
    roster, setRoster: setRosterState, sizes, requireAuth, settings, config, setConfig, locked,
  };

  const panel = {
    product: <ProductPanel />, upload: <UploadPanel />, text: <TextPanel />, art: <ArtPanel />, ai: <AiPanel />, names: <NamesPanel />, layers: <LayersPanel />, order: null,
  }[tool];
  const tools = TOOLS.filter((t) => t.id !== "ai" || config?.ai_enabled);

  const sidePrice = (v: PrintSide) => (v === "front" ? settings.custom_print_price : v === "back" ? settings.custom_back_print_price : settings.custom_sleeve_print_price);

  const orderPanel = rules ? (
    <div className="dz-stack">
      <h3 className="dz-h">Your order</h3>
      <p className="small" style={{ margin: 0 }}>{product.name} · {color}. Printed on {rules.sides.map((s) => SIDE_LABEL[s].toLowerCase()).join(", ")}.</p>
      {rulesProblem && <div className="note-box warn small">{rulesProblem}</div>}
      <button className="btn block lg" disabled={busy} onClick={doContinue}>{busy ? "Sending…" : continueLabel}</button>
    </div>
  ) : (
    <div>
      <h3 className="dz-h">Order</h3>
      <SummaryPanel
        sizes={sizes} variantOf={variantOf} qty={qty} setQty={setQty} personalised={personalised} roster={roster} glow={glow} setGlow={setGlow}
        quote={quote} quoteErr={quoteErr} hasSides={!!sides.length} totalQty={totalQty} colorHex={colorHex} goNames={() => setTool("names")}
      />
      <button className="btn gold block lg mt-16" disabled={busy} onClick={doContinue}>
        {busy ? "Saving your design…" : continueLabel} {!busy && <Icon name="chevron" className="icon sm" />}
      </button>
    </div>
  );
  const firstTier = [...(settings.custom_bulk_tiers || [])].sort((x, y) => x.min_qty - y.min_qty)[0];
  const cost = quote ? quote.subtotal - quote.discount : null;

  return (
    <DesignerCtx.Provider value={api_}>
      <div className="dz studio">
        <header className="dz-top">
          <a href="/" className="logo dz-logo" aria-label={`${settings.store_name} home`}>i<span>K</span>art</a>
          <div className="dz-title">
            <b>{product.name}</b>
            <span className="muted xs"><i className="dz-dot" style={{ background: colorHex }} /> {color}</span>
          </div>
          <div className="dz-actions">
            <div className="dz-actgroup">
              <button onClick={hist.undo} disabled={!hist.canUndo} title="Undo (Ctrl+Z)"><Icon name="undo" /><span>Undo</span></button>
              <button onClick={hist.redo} disabled={!hist.canRedo} title="Redo (Ctrl+Y)"><Icon name="redo" /><span>Redo</span></button>
              {!locked && (
                <>
                  <button onClick={() => askSave("save")} disabled={busy}><Icon name="save" /><span>{saved && savedVersion === version ? "Saved" : "Save"}</span></button>
                  <button onClick={() => askSave("share")} disabled={busy}><Icon name="share" /><span>Share</span></button>
                </>
              )}
              <a href={`https://wa.me/91${(settings.support_phone || "").replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noreferrer"><Icon name="phone" /><span>Contact</span></a>
            </div>
            <button className="btn gold dz-orderbtn" disabled={busy} onClick={() => (locked ? doContinue() : tool === "order" ? doContinue() : (setTool("order"), sides.length && totalQty ? doContinue() : undefined))}>
              {busy ? "Saving…" : locked ? continueLabel : "Order"}
            </button>
          </div>
        </header>

        <div className="dz-body">
          <nav className="dz-rail" aria-label="Design tools">
            {[...tools, { id: "order" as Tool, label: locked ? "Send" : "Order", icon: "bag" }].map((t) => (
              <button key={t.id} className={tool === t.id ? "on" : ""} onClick={() => setTool(t.id)} aria-pressed={tool === t.id}>
                <span className="dz-rail-ico"><Icon name={t.icon} /></span>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>

          <section className="dz-panel" aria-label="Tool options">
            {banner}
            {tool === "order" ? orderPanel : panel}
          </section>

          <main className="dz-stage">
            <div className={`dz-context ${active ? "" : "empty"}`}>
              {active ? (
                <>
                  <label className="dz-mini">
                    <span>Size</span>
                    <input type="range" min={3} max={150} value={Math.round(active.p.w * 100)}
                      onChange={(e) => patch(active.id, { p: resizePlacement(active.p, Number(e.target.value) / 100) }, `size-${active.id}`)} aria-label="Size" />
                  </label>
                  <label className="dz-mini">
                    <span>{Math.round(active.p.rotation || 0)}°</span>
                    <input type="range" min={-180} max={180} value={Math.round(active.p.rotation || 0)}
                      onChange={(e) => patch(active.id, { p: { ...active.p, rotation: Number(e.target.value) } }, `rot-${active.id}`)} aria-label="Rotate" />
                  </label>
                  <div className="dz-tbtns">
                    <div className="dz-pop">
                      <button className="icon-btn" onClick={() => setAlignOpen((o) => !o)} aria-label="Position" title="Position" aria-expanded={alignOpen}><Icon name="align" /></button>
                      {alignOpen && (
                        <div className="dz-grid9" role="group" aria-label="Position on the print area">
                          {(["top", "middle", "bottom"] as const).flatMap((v) => (["left", "center", "right"] as const).map((h) => (
                            <button key={`${v}${h}`} aria-label={`${v} ${h}`} onClick={() => { patch(active.id, { p: alignPlacement(active.p, h, v) }); setAlignOpen(false); }}><i /></button>
                          )))}
                        </div>
                      )}
                    </div>
                    {isImageKind(active.kind) && <button className="icon-btn" onClick={() => patch(active.id, { flip: !active.flip })} aria-label="Mirror" title="Mirror"><Icon name="flip" /></button>}
                    <button className="icon-btn" onClick={() => reorder(active.id, 1)} aria-label="Bring forward" title="Bring forward"><Icon name="up" /></button>
                    <button className="icon-btn" onClick={() => reorder(active.id, -1)} aria-label="Send backward" title="Send backward"><Icon name="down" /></button>
                    <button className="icon-btn" onClick={() => duplicate(active.id)} aria-label="Duplicate" title="Duplicate (Ctrl+D)"><Icon name="copy" /></button>
                    <button className="icon-btn danger" onClick={() => remove(active.id)} aria-label="Delete" title="Delete"><Icon name="trash" /></button>
                    <button className="icon-btn" onClick={() => setActiveId(null)} aria-label="Done" title="Done"><Icon name="check" /></button>
                  </div>
                </>
              ) : (
                <span className="muted small">{design[view].length ? "Tap an item on the T-shirt to move, resize or rotate it." : "Add an image, text or art from the tools on the left."}</span>
              )}
            </div>

            <div className="dz-canvas">
              <DesignCanvas spec={spec} color={colorHex} layers={design[view].map((l) => ({ id: l.id, src: l.src, p: l.p, flip: l.flip }))} activeId={activeId} editable
                onSelect={select} onBegin={() => hist.set((d) => d, null)} onChange={(id, p) => hist.replace((d) => {
                  const w = where(d, id);
                  return w ? { ...d, [w.v]: d[w.v].map((l) => (l.id === id ? { ...l, p } : l)) } : d;
                })} />
            </div>

            {!locked && (
              <button className="dz-cost" onClick={() => setTool("order")} title="Sizes, quantity and price">
                <span className="dz-cost-label">Your cost</span>
                <b>{cost !== null ? money(cost) : <><small className="xs muted">from </small>{money(product.price + settings.custom_print_price)}</>}</b>
                {quote && quote.quantity > 1 && <span className="xs muted">{quote.quantity} pcs · {money(quote.unit_price)} each</span>}
                <span className="dz-cost-hint">
                  {quote?.next_tier ? <>Add <b>{quote.next_tier.min_qty - quote.quantity}</b> more to save {quote.next_tier.percent}%</>
                    : quote?.discount ? <>Bulk discount {quote.discount_percent}% applied</>
                    : firstTier ? <>Order <b>{firstTier.min_qty}+</b> for discounted rates</> : <>{SIDE_LABEL[view]} print area {spec.cm.w}×{spec.cm.h} cm</>}
                </span>
              </button>
            )}
          </main>

          <aside className="dz-views" role="tablist" aria-label="T-shirt sides">
            {VIEWS.map((v) => (
              <button key={v} role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => { setView(v); setActiveId(null); }}>
                <span className="dz-view-thumb"><DesignCanvas spec={views[v]} color={colorHex} layers={design[v].map((l) => ({ id: l.id, src: l.src, p: l.p, flip: l.flip }))} /></span>
                <span className="dz-view-label">{v === "left" ? "Left" : v === "right" ? "Right" : SIDE_LABEL[v]}{design[v].length > 0 && <i className="dz-on" aria-label="has design" />}</span>
                {!locked && <span className="dz-view-price">+{money(sidePrice(v))}</span>}
              </button>
            ))}
          </aside>
        </div>

        <div className="dz-mobilebar">
          <div>
            {rules ? <b className="small">{sides.length ? "Ready to send" : "Add your design"}</b> : quote ? <><b>{money(quote.total - quote.shipping_fee)}</b><span className="xs muted"> · {quote.quantity} pc</span></> : <span className="small muted">{sides.length ? "Choose sizes" : "Add your design"}</span>}
          </div>
          <button className="btn gold" disabled={busy} onClick={() => (tool === "order" || locked ? doContinue() : setTool("order"))}>{busy ? "Saving…" : tool === "order" || locked ? continueLabel : "Order"}</button>
        </div>
      </div>

      {auth && <AuthModal reason="Log in or create a free account to save your design and order. Your design stays as it is." onClose={() => setAuth(null)} onDone={() => { const fn = auth.fn; setAuth(null); setTimeout(fn, 50); }} />}
      {saveOpen && <SaveModal initialName={saved?.name || `${product.name} design`} busy={busy} onClose={() => setSaveOpen(null)} onSave={(n) => saveToAccount(n, saveOpen)} share={saveOpen === "share"} />}
      {shareOpen && saved && <ShareModal token={saved.token} onClose={() => setShareOpen(false)} />}
    </DesignerCtx.Provider>
  );
}

function SummaryPanel({
  sizes, variantOf, qty, setQty, personalised, roster, glow, setGlow, quote, quoteErr, hasSides, totalQty, colorHex, goNames,
}: {
  sizes: string[];
  variantOf(s: string): { id: number; stock: number } | undefined;
  qty: Record<string, number>;
  setQty(fn: (q: Record<string, number>) => Record<string, number>): void;
  personalised: boolean;
  roster: RosterRow[];
  glow: boolean;
  setGlow(v: boolean): void;
  quote: CustomQuote | null;
  quoteErr: string;
  hasSides: boolean;
  totalQty: number;
  colorHex: string;
  goNames(): void;
}) {
  const { settings } = useStore();
  const max = settings.custom_max_qty;
  const counts = roster.reduce<Record<string, number>>((m, r) => ((m[r.size] = (m[r.size] || 0) + 1), m), {});
  const change = (s: string, d: number) =>
    setQty((q) => {
      const stock = variantOf(s)?.stock || 0;
      const n = Math.max(0, Math.min(stock, (q[s] || 0) + d));
      return { ...q, [s]: n };
    });
  const lines: [string, number][] = quote ? [
    ["T-shirt", quote.tshirt_price],
    ...Object.entries(quote.side_charges).map(([s, v]) => [`${SIDE_LABEL[s as PrintSide]} print`, v] as [string, number]),
    ...(quote.foil_charge ? [["Foil finish", quote.foil_charge] as [string, number]] : []),
    ...(quote.name_charge ? [["Name", quote.name_charge] as [string, number]] : []),
    ...(quote.number_charge ? [["Number", quote.number_charge] as [string, number]] : []),
    ...(quote.glow_charge ? [["Glow in the dark", quote.glow_charge] as [string, number]] : []),
  ] : [];

  return (
    <div className="dz-stack">
      <div>
        <div className="dz-label">Colour</div>
        <ColorSwatches size="sm" />
      </div>

      <div>
        <div className="dz-label">Sizes & quantity</div>
        {personalised ? (
          <div className="small">
            {roster.length ? Object.entries(counts).map(([s, n]) => `${s} × ${n}`).join(", ") : "No T-shirts yet."}{" "}
            <button className="link" onClick={goNames}>Edit names list</button>
          </div>
        ) : (
          <div className="dz-sizes">
            {sizes.map((s) => {
              const stock = variantOf(s)?.stock || 0;
              const n = qty[s] || 0;
              return (
                <div key={s} className={`dz-size ${n ? "on" : ""} ${stock <= 0 ? "out" : ""}`}>
                  <b>{s}</b>
                  {stock <= 0 ? <span className="xs muted">Sold out</span> : (
                    <div className="qty sm">
                      <button onClick={() => change(s, -1)} disabled={!n} aria-label={`Fewer ${s}`}>−</button>
                      <span>{n}</span>
                      <button onClick={() => change(s, 1)} disabled={n >= stock || totalQty >= max} aria-label={`More ${s}`}>+</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {totalQty >= max && <div className="xs mt-8">Need more than {max}? <a className="link" href="/contact">Contact us for a bulk price</a>.</div>}
      </div>

      <label className="check dz-addon" style={{ display: "flex" }}>
        <span className="switch"><input type="checkbox" checked={glow} onChange={(e) => setGlow(e.target.checked)} /><i /></span>
        <span><b>Glow in the dark</b> <span className="xs muted">+{money(settings.custom_glow_price)}/pc</span><br /><span className="xs muted">{isDark(colorHex) ? "Looks great on this colour" : "Best on dark colours"}</span></span>
      </label>

      <div className="dz-price">
        {quote ? (
          <>
            {lines.map(([k, v]) => <div key={k} className="sum-row"><span className="muted">{k}</span><span>{money(v)}</span></div>)}
            <div className="sum-row"><span className="muted">Per T-shirt</span><b>{money(quote.unit_price)}</b></div>
            {!!quote.discount && <div className="sum-row save"><span>Bulk discount {quote.discount_percent}%</span><span>−{money(quote.discount)}</span></div>}
            <div className="sum-row total"><span>Total · {quote.quantity} pc</span><span>{money(quote.subtotal - quote.discount)}</span></div>
            {quote.next_tier && <div className="dz-nudge xs">Add {quote.next_tier.min_qty - quote.quantity} more to save {quote.next_tier.percent}%</div>}
          </>
        ) : (
          <div className="small muted">{quoteErr || (!hasSides ? "Add your design to see the price." : "Choose sizes to see the price.")}</div>
        )}
      </div>
    </div>
  );
}

const isDark = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 110;
};

function SaveModal({ initialName, busy, share, onClose, onSave }: { initialName: string; busy: boolean; share: boolean; onClose(): void; onSave(name: string): void }) {
  const [name, setName] = useState(initialName);
  return (
    <Modal title={share ? "Save & share your design" : "Save your design"} onClose={() => !busy && onClose()}
      footer={<><button className="btn light" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" disabled={busy || !name.trim()} onClick={() => onSave(name.trim())}>{busy ? "Saving…" : share ? "Save & get link" : "Save"}</button></>}>
      <div className="field"><label htmlFor="sd-name">Design name</label><input id="sd-name" className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus /></div>
      <p className="xs muted">Saved designs are in <b>My account → My designs</b>, so you can come back and order any time.</p>
    </Modal>
  );
}

function ShareModal({ token, onClose }: { token: string; onClose(): void }) {
  const toast = useToast();
  const link = `${window.location.origin}/customize?design=${token}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied", "success");
    } catch {
      toast("Copy the link from the box", "error");
    }
  };
  return (
    <Modal title="Share your design" onClose={onClose}>
      <p className="small muted" style={{ marginTop: 0 }}>Anyone with this link can see your design and order their own copy (yours stays unchanged).</p>
      <div className="row">
        <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Share link" />
        <button className="btn" onClick={copy}><Icon name="copy" className="icon sm" /> Copy</button>
      </div>
      <a className="btn light block mt-16" href={`https://wa.me/?text=${encodeURIComponent(`Check out my T-shirt design: ${link}`)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
    </Modal>
  );
}
