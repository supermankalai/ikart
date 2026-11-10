import { useId, useRef, useState } from "react";
import { SHAPES, type ViewSpec, isLight, seamsFor, shade, toBox } from "../../lib/teeMockup";
import type { Placement } from "../../lib/types";

export interface CanvasLayer {
  id: string;
  src: string;
  p: Placement;
  flip?: boolean;
}

type Mode = "move" | "scale" | "rotate";

/**
 * The T-shirt (drawn or photo) with the design on it. When `editable`, items can be selected and
 * moved (drag), resized (corner handles) and rotated (top knob), with snapping to the centre lines.
 */
export default function DesignCanvas({
  spec,
  color,
  layers,
  activeId,
  editable = false,
  onSelect,
  onBegin,
  onChange,
}: {
  spec: ViewSpec;
  color: string;
  layers: CanvasLayer[];
  activeId?: string | null;
  editable?: boolean;
  onSelect?(id: string | null): void;
  onBegin?(): void;
  onChange?(id: string, p: Placement): void;
}) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const op = useRef<{ mode: Mode; id: string; start: { x: number; y: number }; orig: Placement; c: { x: number; y: number } } | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const { area, box } = spec;
  const shape = SHAPES[spec.shape];
  const light = isLight(color);
  const guide = spec.photo ? "rgba(255,255,255,0.85)" : light ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.55)";
  const hs = box.w / 42; // handle size

  const toBase = (e: React.PointerEvent | PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    const r = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: r.x, y: r.y };
  };

  const begin = (e: React.PointerEvent, mode: Mode, l: CanvasLayer) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(l.id);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const b = toBox(spec, l.p);
    op.current = { mode, id: l.id, start: toBase(e), orig: l.p, c: { x: b.x + b.w / 2, y: b.y + b.h / 2 } };
    onBegin?.();
  };

  const move = (e: React.PointerEvent) => {
    const o = op.current;
    if (!o || !onChange) return;
    const pt = toBase(e);
    if (o.mode === "move") {
      let x = o.orig.x + (pt.x - o.start.x) / area.w;
      let y = o.orig.y + (pt.y - o.start.y) / area.h;
      // Keep at least a quarter of the item inside the print area
      x = Math.min(1 - o.orig.w * 0.25, Math.max(-o.orig.w * 0.75, x));
      y = Math.min(1 - o.orig.h * 0.25, Math.max(-o.orig.h * 0.75, y));
      const snapV = Math.abs(x + o.orig.w / 2 - 0.5) < 0.025;
      const snapH = Math.abs(y + o.orig.h / 2 - 0.5) < 0.025;
      if (snapV) x = 0.5 - o.orig.w / 2;
      if (snapH) y = 0.5 - o.orig.h / 2;
      setGuides({ v: snapV, h: snapH });
      onChange(o.id, { ...o.orig, x, y });
    } else if (o.mode === "scale") {
      const d0 = Math.hypot(o.start.x - o.c.x, o.start.y - o.c.y) || 1;
      const d1 = Math.hypot(pt.x - o.c.x, pt.y - o.c.y);
      const k = Math.max(0.03 / o.orig.w, Math.min(2.5 / o.orig.w, d1 / d0));
      const w = o.orig.w * k;
      const h = o.orig.h * k;
      const cx = o.orig.x + o.orig.w / 2;
      const cy = o.orig.y + o.orig.h / 2;
      onChange(o.id, { ...o.orig, x: cx - w / 2, y: cy - h / 2, w, h });
    } else {
      let a = (Math.atan2(pt.y - o.c.y, pt.x - o.c.x) * 180) / Math.PI + 90;
      if (a > 180) a -= 360;
      const snap = Math.round(a / 45) * 45;
      if (Math.abs(a - snap) < 4) a = snap;
      if (a <= -180) a += 360;
      onChange(o.id, { ...o.orig, rotation: Math.round(a) });
    }
  };

  const end = () => {
    op.current = null;
    setGuides({ v: false, h: false });
  };

  const placed = layers.map((l) => {
    const b = toBox(spec, l.p);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    return { l, b, cx, cy, rot: `rotate(${l.p.rotation || 0} ${cx} ${cy})` };
  });
  const active = placed.find((x) => x.l.id === activeId);

  return (
    <svg
      ref={svgRef}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      className="tee-mockup"
      role="img"
      aria-label={`T-shirt ${spec.view} design`}
      onPointerDown={() => editable && onSelect?.(null)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <defs>
        <linearGradient id={`shade-${uid}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.10" />
          <stop offset="0.3" stopColor="#000" stopOpacity="0" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.10" />
        </linearGradient>
        <clipPath id={`print-${uid}`}>
          <rect x={area.x} y={area.y} width={area.w} height={area.h} />
        </clipPath>
      </defs>

      {spec.photo ? (
        <image href={spec.photo} x={0} y={0} width={spec.baseW} height={spec.baseH} />
      ) : (
        <>
          <path d={shape.body} fill={color} />
          {shape.neckInner && <path d={shape.neckInner} fill={shade(color, 0.22)} />}
        </>
      )}

      <g clipPath={`url(#print-${uid})`}>
        {placed.map(({ l, b, cx, cy, rot }) => (
          <g key={l.id} transform={rot}>
            <image
              href={l.src}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              preserveAspectRatio="none"
              transform={l.flip ? `translate(${cx} ${cy}) scale(-1 1) translate(${-cx} ${-cy})` : undefined}
            />
          </g>
        ))}
      </g>

      {!spec.photo && (
        <g pointerEvents="none">
          <path d={shape.body} fill={`url(#shade-${uid})`} />
          {seamsFor(spec.shape).map((d) => <path key={d} d={d} fill="none" stroke={shade(color, 0.18)} strokeWidth={1.5} />)}
          <path d={shape.collar} fill="none" stroke={shade(color, 0.1)} strokeWidth={9} />
          <path d={shape.body} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={2} />
        </g>
      )}

      {editable && (
        <g pointerEvents="none">
          <rect x={area.x} y={area.y} width={area.w} height={area.h} fill="none" stroke={guide} strokeDasharray={`${hs * 0.6} ${hs * 0.5}`} strokeWidth={box.w / 400} />
          {guides.v && <line x1={area.x + area.w / 2} x2={area.x + area.w / 2} y1={area.y} y2={area.y + area.h} stroke="#e11d48" strokeWidth={box.w / 350} />}
          {guides.h && <line y1={area.y + area.h / 2} y2={area.y + area.h / 2} x1={area.x} x2={area.x + area.w} stroke="#e11d48" strokeWidth={box.w / 350} />}
        </g>
      )}

      {editable && placed.map(({ l, b, rot }) => (
        <rect
          key={`hit-${l.id}`}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          transform={rot}
          fill="transparent"
          style={{ cursor: "move", touchAction: "none" }}
          onPointerDown={(e) => begin(e, "move", l)}
        />
      ))}

      {editable && active && (
        <g transform={active.rot}>
          <rect x={active.b.x} y={active.b.y} width={active.b.w} height={active.b.h} fill="none" stroke="#c39a5c" strokeWidth={box.w / 260} pointerEvents="none" />
          <line x1={active.cx} x2={active.cx} y1={active.b.y} y2={active.b.y - hs * 2.2} stroke="#c39a5c" strokeWidth={box.w / 300} pointerEvents="none" />
          <circle
            cx={active.cx}
            cy={active.b.y - hs * 2.6}
            r={hs * 0.75}
            fill="#fff"
            stroke="#c39a5c"
            strokeWidth={box.w / 300}
            style={{ cursor: "grab", touchAction: "none" }}
            onPointerDown={(e) => begin(e, "rotate", active.l)}
          >
            <title>Rotate</title>
          </circle>
          {[
            [active.b.x, active.b.y, "nwse-resize"],
            [active.b.x + active.b.w, active.b.y, "nesw-resize"],
            [active.b.x, active.b.y + active.b.h, "nesw-resize"],
            [active.b.x + active.b.w, active.b.y + active.b.h, "nwse-resize"],
          ].map(([x, y, cur], i) => (
            <rect
              key={i}
              x={(x as number) - hs * 0.6}
              y={(y as number) - hs * 0.6}
              width={hs * 1.2}
              height={hs * 1.2}
              rx={hs * 0.25}
              fill="#fff"
              stroke="#c39a5c"
              strokeWidth={box.w / 300}
              style={{ cursor: cur as string, touchAction: "none" }}
              onPointerDown={(e) => begin(e, "scale", active.l)}
            >
              <title>Resize</title>
            </rect>
          ))}
        </g>
      )}
    </svg>
  );
}
