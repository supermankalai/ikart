/**
 * 360° view of the design: the T-shirt as a soft 3D model that turns by itself and follows the pointer
 * (drag to spin). Front and back show exactly what the editor shows; sleeve designs wrap over the sleeves.
 * When the product uses real photos there is no 3D shape to wrap, so the photos turn as a two-sided card.
 * Loaded lazily, so three.js is downloaded only when the customer opens this view.
 */
import { useEffect, useRef } from "react";
import {
  BufferAttribute, BufferGeometry, CanvasTexture, DirectionalLight, FrontSide, Group, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, Shape, ShapeGeometry, SRGBColorSpace, Vector2, WebGLRenderer,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { EditorDesign } from "../../lib/designState";
import { type RenderLayer, type SleeveArt, TEE_H, TEE_W, type ViewSpec, paintView } from "../../lib/teeMockup";
import type { PrintSide } from "../../lib/types";
import { signedDistance, smooth, subdivide } from "../HangerScene";

interface Props {
  views: Record<PrintSide, ViewSpec>;
  design: EditorDesign;
  colorHex: string;
  photos: Record<string, HTMLImageElement>;
  onFail(): void;
}

const UNIT = 100; // base units per world unit
const TEX_W = 1024;

/** Outline of the drawn T-shirt (the back's, which also covers the front's neck opening), in base coordinates. */
function teeOutline(): Vector2[] {
  const s = new Shape();
  s.moveTo(185, 38);
  s.bezierCurveTo(210, 54, 290, 54, 315, 38);
  s.lineTo(392, 66);
  s.lineTo(478, 158);
  s.lineTo(424, 210);
  s.lineTo(392, 182);
  s.lineTo(396, 528);
  s.quadraticCurveTo(250, 540, 104, 528);
  s.lineTo(108, 182);
  s.lineTo(76, 210);
  s.lineTo(22, 158);
  s.lineTo(108, 66);
  s.lineTo(185, 38);
  return s.getPoints(16);
}

/** One face of the T-shirt: flat at the edge, puffed out like fabric in the middle. `side` 1 = front, -1 = back. */
function teeFace(outline: Vector2[], side: 1 | -1): BufferGeometry {
  const flat = new ShapeGeometry(new Shape(outline)).toNonIndexed();
  const tri = subdivide(flat.getAttribute("position").array as Float32Array, 4);
  flat.dispose();
  const n = tri.length / 3;
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const swap = [0, 2, 1];
  for (let i = 0; i < n; i++) {
    // Base coordinates run downwards, so every triangle is reversed to keep the face pointing outwards
    const j = i - (i % 3) + swap[i % 3];
    const bx = tri[j * 3], by = tri[j * 3 + 1];
    const k = smooth(signedDistance(bx, by, outline) / 70);
    const lower = smooth((by - 230) / 220);
    const z = 40 * Math.pow(k, 0.7) + k * lower * (2.2 * Math.sin(bx * 0.085 + 0.6) + 0.8 * Math.sin(bx * 0.2 + by * 0.03));
    pos[i * 3] = (side * (bx - TEE_W / 2)) / UNIT;
    pos[i * 3 + 1] = (TEE_H / 2 - by) / UNIT;
    pos[i * 3 + 2] = (side * z) / UNIT;
    uv[i * 2] = bx / TEE_W;
    uv[i * 2 + 1] = 1 - by / TEE_H;
  }
  let g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  return g;
}

const renderLayers = (d: EditorDesign, v: PrintSide): RenderLayer[] => d[v].map((l) => ({ source: l.source, p: l.p, flip: l.flip }));

export default function Tee360({ views, design, colorHex, photos, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const paint = useRef<(() => void) | null>(null);
  const live = useRef({ views, design, colorHex, photos, onFail });
  live.current = { views, design, colorHex, photos, onFail };

  const model = !views.front.photo && !views.back.photo;
  const shapeKey = model ? "model" : (["front", "back"] as const).map((v) => `${views[v].box.w}x${views[v].box.h}`).join("|");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      live.current.onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    const canvas = renderer.domElement;
    el.appendChild(canvas);

    const scene = new Scene();
    const camera = new PerspectiveCamera(28, 1, 0.1, 100);
    scene.add(new HemisphereLight(0xffffff, 0xd8d2c8, 2.1));
    const key = new DirectionalLight(0xffffff, 1.5);
    key.position.set(1.5, 2.5, 6);
    scene.add(key);

    const disposables: { dispose(): void }[] = [];
    const own = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
    const spinner = new Group();
    scene.add(spinner);

    // One canvas texture per face, repainted whenever the design changes
    const faces = (["front", "back"] as const).map((v) => {
      const spec = live.current.views[v];
      const w = model ? TEE_W : spec.box.w;
      const h = model ? TEE_H : spec.box.h;
      const tc = document.createElement("canvas");
      tc.width = TEX_W;
      tc.height = Math.round((TEX_W * h) / w);
      const tex = own(new CanvasTexture(tc));
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const mat = own(new MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0, side: FrontSide }));
      return { v, canvas: tc, tex, mat, w, h };
    });

    let height = TEE_H / UNIT;
    let width = TEE_W / UNIT;
    if (model) {
      const outline = teeOutline();
      faces.forEach((f, i) => spinner.add(new Mesh(own(teeFace(outline, i === 0 ? 1 : -1)), f.mat)));
    } else {
      height = 5.6;
      width = Math.max(...faces.map((f) => (height * f.w) / f.h));
      faces.forEach((f, i) => {
        const mesh = new Mesh(own(new PlaneGeometry((height * f.w) / f.h, height)), f.mat);
        mesh.position.z = i === 0 ? 0.01 : -0.01;
        if (i === 1) mesh.rotation.y = Math.PI;
        spinner.add(mesh);
      });
    }

    let dirty = true;
    paint.current = () => {
      const { views: vs, design: d, colorHex: hex, photos: ph } = live.current;
      for (const f of faces) {
        const spec = vs[f.v];
        const ctx = f.canvas.getContext("2d")!;
        const scale = f.canvas.width / f.w;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // Filled edge to edge so the rim of the model never samples an empty pixel
        ctx.fillStyle = model ? hex : "#f3f0ea";
        ctx.fillRect(0, 0, f.canvas.width, f.canvas.height);
        ctx.setTransform(scale, 0, 0, scale, model ? 0 : -spec.box.x * scale, model ? 0 : -spec.box.y * scale);
        // Wearer's left sleeve is on the right of the front view and on the left of the back view
        const sleeves: SleeveArt[] = model ? [
          { spec: vs.left, layers: renderLayers(d, "left"), on: f.v === "front" ? "right" : "left" },
          { spec: vs.right, layers: renderLayers(d, "right"), on: f.v === "front" ? "left" : "right" },
        ] : [];
        try {
          paintView(ctx, spec, hex, renderLayers(d, f.v), spec.photo ? ph[spec.photo] || null : null, sleeves);
        } catch {
          // an image that can't be drawn yet is skipped until the next repaint
        }
        f.tex.needsUpdate = true;
      }
      dirty = true;
    };
    paint.current();

    // ---------- Turning ----------
    let angle = -0.5, tilt = 0.06, vel = 0, raf = 0, last = performance.now();
    let auto = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let drag: { x: number; y: number; id: number } | null = null;
    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
      auto = false;
      vel = 0;
    };
    const moveBy = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = (e.clientX - drag.x) * 0.011;
      angle += dx;
      vel = dx;
      tilt = Math.max(-0.45, Math.min(0.45, tilt + (e.clientY - drag.y) * 0.004));
      drag.x = e.clientX;
      drag.y = e.clientY;
      dirty = true;
    };
    const up = () => {
      drag = null;
      canvas.style.cursor = "grab";
    };
    const keyTurn = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      e.stopPropagation();
      auto = false;
      angle += e.key === "ArrowLeft" ? -0.26 : 0.26;
      dirty = true;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", moveBy);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    el.addEventListener("keydown", keyTurn);

    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Far enough to fit the garment at any angle, with a little air around it
      const half = Math.tan((camera.fov * Math.PI) / 360);
      camera.position.set(0, 0, Math.max((height * 0.56) / half, (width * 0.56) / (half * camera.aspect)));
      camera.updateProjectionMatrix();
      dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (auto) {
        angle += dt * 0.55;
        dirty = true;
      } else if (!drag && Math.abs(vel) > 0.0004) {
        angle += vel;
        vel *= 0.94;
        dirty = true;
      }
      if (!dirty) return;
      dirty = false;
      spinner.rotation.set(tilt, angle, 0);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("keydown", keyTurn);
      paint.current = null;
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      canvas.remove();
    };
  }, [model, shapeKey]);

  useEffect(() => paint.current?.(), [views, design, colorHex, photos]);

  return <div ref={host} className="tee-360" tabIndex={0} role="img" aria-label="360 degree view of your T-shirt. Drag, or use the left and right arrow keys, to turn it." />;
}
