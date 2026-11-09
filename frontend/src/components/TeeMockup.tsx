import { useId, useRef } from "react";
import { PRINT, SEAM_PATHS, SHAPES, TEE_H, TEE_W, isLight, shade, toBox } from "../lib/teeMockup";
import type { Placement, PrintSide } from "../lib/types";

export interface MockupLayer {
  id: string;
  src: string;
  p: Placement;
}

/**
 * T-shirt mockup (front or back) with the customer's images and text. When `onMove` is given,
 * layers can be selected and dragged (mouse or touch) inside the dashed print area.
 */
export default function TeeMockup({
  color,
  side = "front",
  layers = [],
  activeId,
  onSelect,
  onMove,
}: {
  color: string;
  side?: PrintSide;
  layers?: MockupLayer[];
  activeId?: string | null;
  onSelect?(id: string): void;
  onMove?(id: string, p: Placement): void;
}) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; orig: Placement; unit: number } | null>(null);
  const shape = SHAPES[side];
  const area = PRINT[side];
  const guide = isLight(color) ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.55)";
  const editable = !!onMove;

  const onDown = (e: React.PointerEvent, l: MockupLayer) => {
    if (!editable || !svgRef.current) return;
    e.preventDefault();
    onSelect?.(l.id);
    (e.target as Element).setPointerCapture(e.pointerId);
    const rect = svgRef.current.getBoundingClientRect();
    drag.current = { id: l.id, startX: e.clientX, startY: e.clientY, orig: l.p, unit: TEE_W / rect.width };
  };
  const onDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !onMove) return;
    const dx = ((e.clientX - d.startX) * d.unit) / area.w;
    const dy = ((e.clientY - d.startY) * d.unit) / area.h;
    // Keep at least a quarter of the item inside the print area
    const x = Math.min(1 - d.orig.w * 0.25, Math.max(-d.orig.w * 0.75, d.orig.x + dx));
    const y = Math.min(1 - d.orig.h * 0.25, Math.max(-d.orig.h * 0.75, d.orig.y + dy));
    onMove(d.id, { ...d.orig, x, y });
  };
  const onUp = () => {
    drag.current = null;
  };

  const rot = (l: MockupLayer) => {
    const b = toBox(side, l.p);
    return { b, t: `rotate(${l.p.rotation || 0} ${b.x + b.w / 2} ${b.y + b.h / 2})` };
  };

  return (
    <svg ref={svgRef} viewBox={`0 0 ${TEE_W} ${TEE_H}`} className="tee-mockup" role="img" aria-label={`T-shirt ${side} preview`}>
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
      <path d={shape.body} fill={color} />
      {shape.neckInner && <path d={shape.neckInner} fill={shade(color, 0.22)} />}
      <g clipPath={`url(#print-${uid})`}>
        {layers.map((l) => {
          const { b, t } = rot(l);
          return <image key={l.id} href={l.src} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" transform={t} />;
        })}
      </g>
      <path d={shape.body} fill={`url(#shade-${uid})`} pointerEvents="none" />
      {SEAM_PATHS.map((d) => (
        <path key={d} d={d} fill="none" stroke={shade(color, 0.18)} strokeWidth={1.5} />
      ))}
      <path d={shape.collar} fill="none" stroke={shade(color, 0.1)} strokeWidth={9} />
      <path d={shape.body} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={2} />
      {editable && (
        <rect x={area.x} y={area.y} width={area.w} height={area.h} fill="none" stroke={guide} strokeDasharray="6 5" strokeWidth={1.2} pointerEvents="none" />
      )}
      {editable &&
        layers.map((l) => {
          const { b, t } = rot(l);
          const on = l.id === activeId;
          return (
            <rect
              key={l.id}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              transform={t}
              fill="transparent"
              stroke={on ? "#c39a5c" : guide}
              strokeWidth={on ? 2 : 1}
              strokeDasharray={on ? undefined : "3 3"}
              style={{ cursor: "move", touchAction: "none" }}
              onPointerDown={(e) => onDown(e, l)}
              onPointerMove={onDrag}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
          );
        })}
    </svg>
  );
}
