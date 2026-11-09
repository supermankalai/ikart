/**
 * 3D home-page hero: T-shirts and track pants hanging on a brass rail.
 * Every garment sways gently and turns slowly; click one to open that product.
 *
 * A garment is drawn either from the product PHOTO (when the photo is a garment on a plain
 * background, it is cut out automatically, see garmentCutout.ts) or, as a fallback, as a 3D model
 * in the product colour (an extruded outline, subdivided and puffed out like soft fabric).
 * Loaded lazily from Home, so the rest of the site never downloads three.js.
 */
import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping, BackSide, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color,
  CylinderGeometry, DirectionalLight, ExtrudeGeometry, FrontSide, Group, HemisphereLight, LineCurve3, Mesh,
  MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry,
  QuadraticBezierCurve3, Raycaster, RepeatWrapping, Scene, Shape, ShadowMaterial, SphereGeometry, SRGBColorSpace,
  TubeGeometry, Vector2, Vector3, WebGLRenderer, type Material,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { cutoutGarment, type Cutout } from "./garmentCutout";

export interface RailItem {
  slug: string;
  name: string;
  kind: "top" | "bottom";
  color: string; // hex, used by the 3D model
  image?: string | null; // product photo; used when it can be cut out cleanly
  stripe?: boolean; // side stripe on modelled track pants
}

interface Props {
  items: RailItem[];
  onPick(slug: string): void;
  onHover(slug: string | null): void;
  onFail(): void;
}

const RAIL_Y = 1.25;
const HANG = 0.62; // hanger centre below the rail
const GAP = 0.42;

// ---------- small math helpers ----------
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/** Signed distance from (x, y) to a closed polyline: positive inside, negative outside. */
function signedDistance(x: number, y: number, pts: Vector2[]): number {
  let d = Infinity, inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j], b = pts[i];
    const ex = b.x - a.x, ey = b.y - a.y;
    const t = clamp01(((x - a.x) * ex + (y - a.y) * ey) / (ex * ex + ey * ey || 1));
    const dx = x - (a.x + ex * t), dy = y - (a.y + ey * t);
    d = Math.min(d, dx * dx + dy * dy);
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return (inside ? 1 : -1) * Math.sqrt(d);
}

/** Split every triangle into 4. Shared edges get identical midpoints, so the mesh stays crack-free. */
function subdivide(p: Float32Array, times: number): Float32Array {
  for (let n = 0; n < times; n++) {
    const out = new Float32Array(p.length * 4);
    let o = 0;
    for (let i = 0; i < p.length; i += 9) {
      const A = [p[i], p[i + 1], p[i + 2]], B = [p[i + 3], p[i + 4], p[i + 5]], C = [p[i + 6], p[i + 7], p[i + 8]];
      const mid = (u: number[], v: number[]) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
      const AB = mid(A, B), BC = mid(B, C), CA = mid(C, A);
      for (const tri of [[A, AB, CA], [AB, B, BC], [CA, BC, C], [AB, BC, CA]]) for (const v of tri) { out[o++] = v[0]; out[o++] = v[1]; out[o++] = v[2]; }
    }
    p = out;
  }
  return p;
}

// ---------- garment outlines (top edge at y = 0) ----------
function teeOutline(): Shape {
  const s = new Shape();
  s.moveTo(-0.3, 0.02);
  s.quadraticCurveTo(0, -0.26, 0.3, 0.02); // front neckline
  s.lineTo(0.64, -0.1); // shoulder
  s.lineTo(1.08, -0.5); // sleeve top
  s.lineTo(0.88, -0.8); // cuff
  s.lineTo(0.66, -0.62); // underarm
  s.quadraticCurveTo(0.61, -1.4, 0.68, -2.2); // side seam
  s.quadraticCurveTo(0, -2.27, -0.68, -2.2); // hem
  s.quadraticCurveTo(-0.61, -1.4, -0.66, -0.62);
  s.lineTo(-0.88, -0.8);
  s.lineTo(-1.08, -0.5);
  s.lineTo(-0.64, -0.1);
  s.lineTo(-0.3, 0.02);
  return s;
}

function pantsOutline(): Shape {
  const s = new Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0.53, -0.28); // waist to hip
  s.quadraticCurveTo(0.59, -0.85, 0.52, -1.65); // hip / thigh
  s.lineTo(0.43, -2.72); // calf
  s.quadraticCurveTo(0.45, -2.88, 0.39, -3.0); // jogger cuff
  s.lineTo(0.14, -3.0);
  s.quadraticCurveTo(0.1, -2.9, 0.12, -2.72);
  s.lineTo(0.07, -1.12); // inseam
  s.quadraticCurveTo(0, -0.92, -0.07, -1.12); // crotch
  s.lineTo(-0.12, -2.72);
  s.quadraticCurveTo(-0.1, -2.9, -0.14, -3.0);
  s.lineTo(-0.39, -3.0);
  s.quadraticCurveTo(-0.45, -2.88, -0.43, -2.72);
  s.lineTo(-0.52, -1.65);
  s.quadraticCurveTo(-0.59, -0.85, -0.53, -0.28);
  s.lineTo(-0.5, 0);
  return s;
}

const teeFolds = (x: number, y: number) => {
  const lower = smooth((-y - 0.9) / 1.2);
  return 0.02 * Math.sin(x * 10.5 + 0.6) * lower + 0.007 * Math.sin(x * 23 + y * 3) * lower;
};
const pantsFolds = (x: number, y: number) => {
  const cuff = smooth((-y - 2.35) / 0.35); // jogger bunching above the cuff
  return 0.012 * Math.sin(x * 16) * smooth((-y - 0.4) / 0.6) + 0.02 * Math.sin(y * 15) * cuff;
};

/** Extrude an outline, add detail to the flat faces and puff them out like fabric. */
function buildGarment(shape: Shape, puff: number, soft: number, folds: (x: number, y: number) => number): BufferGeometry {
  const ext = new ExtrudeGeometry(shape, {
    depth: 0.08, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 5, curveSegments: 24,
  });
  ext.translate(0, 0, -0.04);
  // groups: 0 = front/back caps, 1 = rounded sides. Only the caps need extra detail.
  const src = ext.getAttribute("position").array as Float32Array;
  const caps: number[] = [], sides: number[] = [];
  for (const grp of ext.groups) {
    const target = grp.materialIndex === 0 ? caps : sides;
    for (let i = grp.start * 3; i < (grp.start + grp.count) * 3; i++) target.push(src[i]);
  }
  ext.dispose();
  const capPos = subdivide(new Float32Array(caps), 4);
  const all = new Float32Array(capPos.length + sides.length);
  all.set(capPos, 0);
  all.set(sides, capPos.length);
  let g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(all, 3));
  g = mergeVertices(g, 1e-5);

  const outline = shape.getPoints(24);
  const pos = g.getAttribute("position") as BufferAttribute;
  const capZ = 0.11 - 1e-4;
  const sd = new Float32Array(pos.count);
  let edge = Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getZ(i)) < capZ) continue;
    sd[i] = signedDistance(pos.getX(i), pos.getY(i), outline);
    edge = Math.min(edge, sd[i]);
  }
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    uv[i * 2] = x * 1.6;
    uv[i * 2 + 1] = y * 1.6;
    if (Math.abs(z) < capZ) continue;
    const side = z > 0 ? 1 : -1;
    const k = smooth((sd[i] - edge) / soft);
    pos.setZ(i, z + side * k * (puff + folds(x, y) * (side > 0 ? 1 : 0.6)));
  }
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function surfaceZ(shape: Shape, puff: number, soft: number, folds: (x: number, y: number) => number, x: number, y: number) {
  const k = smooth((signedDistance(x, y, shape.getPoints(24)) + 0.05) / soft);
  return 0.11 + k * (puff + folds(x, y));
}

// ---------- textures ----------
function knitTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = "#808080";
  x.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 32; row++) {
    for (let col = 0; col < 32; col++) {
      const px = col * 4, py = row * 4;
      x.fillStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.05})`;
      x.fillRect(px, py, 2, 3);
      x.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.05})`;
      x.fillRect(px + 2, py + 1, 2, 3);
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

function logoTexture(onDark: boolean): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const x = c.getContext("2d")!;
  x.font = "700 58px 'Playfair Display', Georgia, serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  const ink = onDark ? "rgba(255,248,235,0.92)" : "rgba(25,22,18,0.85)";
  x.fillStyle = ink;
  x.fillText("e", 82, 50);
  x.fillStyle = "#c39a5c";
  x.fillText("K", 120, 50);
  x.fillStyle = ink;
  x.fillText("art", 172, 50);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const luminance = (hex: string) => {
  const c = new Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

// ---------- Component ----------
export default function HangerScene({ items, onPick, onHover, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef({ onPick, onHover, onFail });
  cb.current = { onPick, onHover, onFail };
  const key = items.map((t) => `${t.slug}:${t.kind}:${t.color}:${t.image || ""}`).join("|");

  useEffect(() => {
    const el = host.current;
    if (!el || !items.length) return;
    let cancelled = false;
    let teardown: (() => void) | null = null;

    (async () => {
      // On narrow screens 3 garments, otherwise up to 4
      const list = items.slice(0, el.clientWidth < 560 ? 3 : 4);
      // Cut garments out of their photos first (skips photos that aren't suitable)
      const cutouts: (Cutout | null)[] = await Promise.all(
        list.map((it) => (it.image ? withTimeout(cutoutGarment(it.image), 4000, null) : Promise.resolve(null))),
      );
      if (cancelled) return;
      teardown = build(el, list, cutouts);
    })();

    return () => {
      cancelled = true;
      teardown?.();
    };

    function build(el: HTMLDivElement, list: RailItem[], cutouts: (Cutout | null)[]): (() => void) | null {
      let renderer: WebGLRenderer;
      try {
        renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      } catch {
        cb.current.onFail();
        return null;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFSoftShadowMap;
      const canvas = renderer.domElement;
      canvas.setAttribute("aria-hidden", "true");
      el.appendChild(canvas);

      const scene = new Scene();
      const camera = new PerspectiveCamera(30, 1, 0.1, 100);
      const disposables: { dispose(): void }[] = [];
      const own = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

      // Lights
      scene.add(new HemisphereLight(0xfff4e2, 0xcdbb9f, 1.5));
      const keyLight = new DirectionalLight(0xfff1dc, 2.4);
      keyLight.position.set(3.5, 5, 6);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.radius = 6;
      keyLight.shadow.bias = -0.0005;
      Object.assign(keyLight.shadow.camera, { left: -7, right: 7, top: 4, bottom: -6, near: 1, far: 20 });
      scene.add(keyLight);
      const rim = new DirectionalLight(0xdfe8ff, 0.7);
      rim.position.set(-5, 2, -3);
      scene.add(rim);

      const wall = new Mesh(own(new PlaneGeometry(34, 18)), own(new ShadowMaterial({ opacity: 0.13 })));
      wall.position.set(0, -1.2, -1.6);
      wall.receiveShadow = true;
      scene.add(wall);

      // Shared materials and parts
      const brass = own(new MeshStandardMaterial({ color: 0xb48c52, metalness: 1, roughness: 0.32 }));
      const chrome = own(new MeshStandardMaterial({ color: 0xd9d6cf, metalness: 1, roughness: 0.22 }));
      const wood = own(new MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.5, metalness: 0.05 }));
      const clipMat = own(new MeshStandardMaterial({ color: 0x2a2826, metalness: 0.4, roughness: 0.45 }));
      const knit = own(knitTexture());
      const hookGeo = own(new TubeGeometry(new CatmullRomCurve3([
        new Vector3(0, -HANG, 0), new Vector3(0, -0.3, 0.05), new Vector3(0, -0.06, 0.1), new Vector3(0, 0.08, 0.07),
        new Vector3(0, 0.11, 0), new Vector3(0, 0.07, -0.07), new Vector3(0, -0.03, -0.09),
      ]), 48, 0.018, 10));

      const teeShape = teeOutline(), pantsShape = pantsOutline();
      const needTee = list.some((it, i) => it.kind === "top" && !cutouts[i]);
      const needPants = list.some((it, i) => it.kind === "bottom" && !cutouts[i]);
      const teeGeo = needTee ? own(buildGarment(teeShape, 0.13, 0.38, teeFolds)) : null;
      const pantsGeo = needPants ? own(buildGarment(pantsShape, 0.1, 0.22, pantsFolds)) : null;

      const fabric = (hex: string) => {
        const color = new Color(hex);
        return own(new MeshPhysicalMaterial({
          color, roughness: 0.92, sheen: 1, sheenRoughness: 0.55,
          sheenColor: color.clone().lerp(new Color(0xffffff), 0.45), bumpMap: knit, bumpScale: 0.6,
        }));
      };
      const rib = (hex: string) => {
        const m = fabric(hex);
        m.color.multiplyScalar(luminance(hex) < 0.35 ? 1.25 : 0.86);
        return m;
      };

      type Rig = {
        slug: string; pivot: Group; swivel: Group; body: Group; phase: number; dir: number; photo: boolean;
        cloth?: { geo: PlaneGeometry; base: Float32Array; w: number; h: number };
      };
      const rigs: Rig[] = [];
      const pickables: Object3D[] = [];
      const widths: number[] = [];
      let lowest = RAIL_Y;

      list.forEach((it, i) => {
        const cut = cutouts[i];
        const pivot = new Group(); // sways from the rail
        const hook = new Mesh(hookGeo, chrome);
        hook.castShadow = true;
        pivot.add(hook);
        const swivel = new Group(); // turns under the hook
        pivot.add(swivel);
        const body = new Group();
        body.userData.slug = it.slug;
        swivel.add(body);
        let width: number, length: number;
        let cloth: Rig["cloth"];

        // Clip hanger for bottoms (bar + 2 clips), wooden hanger inside tops
        let topY = -HANG;
        if (it.kind === "bottom") {
          const bar = new Mesh(own(new TubeGeometry(new LineCurve3(new Vector3(-0.62, -HANG, 0), new Vector3(0.62, -HANG, 0)), 4, 0.025, 10)), chrome);
          bar.castShadow = true;
          swivel.add(bar);
          for (const sx of [-0.42, 0.42]) {
            const clip = new Mesh(own(new BoxGeometry(0.13, 0.22, 0.2)), clipMat);
            clip.position.set(sx, -HANG - 0.1, 0);
            clip.castShadow = true;
            swivel.add(clip);
          }
          topY = -HANG - 0.1;
        }

        if (cut) {
          // ----- Photo garment: the cut-out photo on a gently curved, rippling sheet -----
          const maxW = it.kind === "top" ? 2.3 : 1.45;
          length = it.kind === "top" ? 2.3 : 3.0;
          width = length * cut.aspect;
          if (width > maxW) {
            width = maxW;
            length = width / cut.aspect;
          }
          const tex = own(new CanvasTexture(cut.canvas));
          tex.colorSpace = SRGBColorSpace;
          tex.anisotropy = 4;
          const backTex = own(tex.clone());
          backTex.wrapS = RepeatWrapping;
          backTex.repeat.x = -1; // so the back view isn't mirrored
          backTex.needsUpdate = true;
          const geo = own(new PlaneGeometry(width, length, 18, 26));
          geo.translate(0, -length / 2, 0);
          const front = new Mesh(geo, own(new MeshStandardMaterial({ map: tex, alphaTest: 0.45, roughness: 0.85, side: FrontSide })));
          const back = new Mesh(geo, own(new MeshStandardMaterial({ map: backTex, alphaTest: 0.45, roughness: 0.9, side: BackSide, color: 0xd6d2ca })));
          front.castShadow = back.castShadow = true;
          body.add(front, back);
          body.position.y = it.kind === "top" ? topY + 0.04 : topY + 0.06;
          cloth = { geo, base: Float32Array.from(geo.getAttribute("position").array as Float32Array), w: width, h: length };
          [front, back].forEach((m) => { m.userData.slug = it.slug; pickables.push(m); });
        } else if (it.kind === "top") {
          // ----- 3D model T-shirt -----
          width = 2.16;
          length = 2.27;
          const dark = luminance(it.color) < 0.35;
          const bar = new Mesh(own(new TubeGeometry(
            new QuadraticBezierCurve3(new Vector3(-0.6, -0.78, 0), new Vector3(0, -0.56, 0), new Vector3(0.6, -0.78, 0)), 32, 0.04, 10,
          )), wood);
          swivel.add(bar);
          const m = new Mesh(teeGeo!, fabric(it.color));
          m.castShadow = m.receiveShadow = true;
          const r = rib(it.color);
          const collar = new Mesh(own(new TubeGeometry(
            new QuadraticBezierCurve3(new Vector3(-0.3, 0.02, 0), new Vector3(0, -0.26, 0), new Vector3(0.3, 0.02, 0)), 32, 0.035, 10,
          )), r);
          collar.position.z = 0.115;
          const backCollar = new Mesh(own(new TubeGeometry(
            new QuadraticBezierCurve3(new Vector3(-0.3, 0.02, 0), new Vector3(0, 0.06, 0), new Vector3(0.3, 0.02, 0)), 24, 0.032, 10,
          )), r);
          backCollar.position.z = -0.1;
          const logo = new Mesh(own(new PlaneGeometry(0.3, 0.113)),
            own(new MeshStandardMaterial({ map: own(logoTexture(dark)), transparent: true, roughness: 0.8, depthWrite: false })));
          logo.position.set(0.3, -0.62, surfaceZ(teeShape, 0.13, 0.38, teeFolds, 0.3, -0.62) + 0.006);
          body.add(m, collar, backCollar, logo);
          body.position.y = topY;
          [m, collar, backCollar, logo].forEach((x) => { x.userData.slug = it.slug; pickables.push(x); });
        } else {
          // ----- 3D model track pants -----
          width = 1.2;
          length = 3.0;
          const dark = luminance(it.color) < 0.35;
          const m = new Mesh(pantsGeo!, fabric(it.color));
          m.castShadow = m.receiveShadow = true;
          const r = rib(it.color);
          const band = new Mesh(own(new TubeGeometry(new LineCurve3(new Vector3(-0.52, -0.11, 0), new Vector3(0.52, -0.11, 0)), 4, 0.12, 14)), r);
          band.scale.z = 1.05;
          const parts: Mesh[] = [m, band];
          for (const sx of [-0.255, 0.255]) {
            const cuff = new Mesh(own(new TubeGeometry(new LineCurve3(new Vector3(sx - 0.14, -2.94, 0), new Vector3(sx + 0.14, -2.94, 0)), 4, 0.075, 12)), r);
            parts.push(cuff);
          }
          const cord = own(new MeshStandardMaterial({ color: dark ? 0xf2efe8 : 0x2b2926, roughness: 0.7 }));
          const zf = 0.2;
          for (const sx of [-1, 1]) {
            const s = new Mesh(own(new TubeGeometry(new CatmullRomCurve3([
              new Vector3(0.05 * sx, -0.14, zf), new Vector3(0.08 * sx, -0.3, zf), new Vector3(0.06 * sx, -0.48, zf - 0.01), new Vector3(0.1 * sx, -0.62, zf - 0.02),
            ]), 16, 0.014, 6)), cord);
            parts.push(s);
          }
          if (it.stripe) {
            const stripeMat = own(new MeshStandardMaterial({ color: dark ? 0xf4f1ea : 0x1d1d1f, roughness: 0.7 }));
            for (const sx of [-1, 1]) {
              const st = new Mesh(own(new TubeGeometry(new CatmullRomCurve3([
                new Vector3(0.5 * sx, -0.3, 0.12), new Vector3(0.52 * sx, -1.0, 0.13), new Vector3(0.48 * sx, -1.8, 0.13), new Vector3(0.42 * sx, -2.7, 0.12),
              ]), 24, 0.022, 6)), stripeMat);
              parts.push(st);
            }
          }
          body.add(...parts);
          body.position.y = topY;
          parts.forEach((x) => { x.castShadow = true; x.userData.slug = it.slug; pickables.push(x); });
        }

        lowest = Math.min(lowest, RAIL_Y + body.position.y - length);
        widths.push(width);
        scene.add(pivot);
        rigs.push({ slug: it.slug, pivot, swivel, body, phase: i * 1.9 + 0.4, dir: i % 2 ? -1 : 1, photo: !!cut, cloth });
      });

      // Positions along the rail by each garment's width
      const total = widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1);
      let x = -total / 2;
      rigs.forEach((r, i) => {
        r.pivot.position.set(x + widths[i] / 2, RAIL_Y, 0);
        x += widths[i] + GAP;
      });

      // Rail, end caps and ceiling rods
      const railLen = total + 0.5;
      const rail = new Mesh(own(new CylinderGeometry(0.045, 0.045, railLen, 24)), brass);
      rail.rotation.z = Math.PI / 2;
      rail.position.y = RAIL_Y;
      rail.castShadow = true;
      scene.add(rail);
      for (const sx of [-1, 1]) {
        const cap = new Mesh(own(new SphereGeometry(0.075, 20, 16)), brass);
        cap.position.set((sx * railLen) / 2, RAIL_Y, 0);
        scene.add(cap);
        const rod = new Mesh(own(new CylinderGeometry(0.02, 0.02, 4, 12)), brass);
        rod.position.set(sx * (railLen / 2 - 0.25), RAIL_Y + 2, 0);
        rod.castShadow = true;
        scene.add(rod);
      }

      // ---------- Camera framing ----------
      const top = RAIL_Y + 0.35, bottom = lowest - 0.15;
      const target = new Vector3(0, (top + bottom) / 2, 0);
      let baseZ = 10;
      const fit = () => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const vFov = (camera.fov * Math.PI) / 180;
        const distH = (top - bottom) / 2 / Math.tan(vFov / 2);
        const distW = (railLen + 0.5) / 2 / (Math.tan(vFov / 2) * camera.aspect);
        baseZ = Math.max(distH, distW) * 1.03;
        camera.updateProjectionMatrix();
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);

      // ---------- Interaction ----------
      const pointer = new Vector2(), parallax = new Vector2(), camOffset = new Vector2();
      const ray = new Raycaster();
      let hovered: string | null = null;
      const pick = (e: PointerEvent): string | null => {
        const r = canvas.getBoundingClientRect();
        pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(pointer, camera);
        return (ray.intersectObjects(pickables, false)[0]?.object.userData.slug as string) || null;
      };
      const onMove = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        parallax.set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
        if (e.pointerType !== "mouse") return;
        const slug = pick(e);
        if (slug !== hovered) {
          hovered = slug;
          canvas.style.cursor = slug ? "pointer" : "";
          cb.current.onHover(slug);
        }
      };
      const onLeave = () => {
        parallax.set(0, 0);
        if (hovered) {
          hovered = null;
          canvas.style.cursor = "";
          cb.current.onHover(null);
        }
      };
      let downAt = 0;
      const onDown = () => (downAt = performance.now());
      const onUp = (e: PointerEvent) => {
        if (performance.now() - downAt > 400) return;
        const slug = pick(e);
        if (slug) cb.current.onPick(slug);
      };
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerleave", onLeave);
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointerup", onUp);

      // ---------- Animation ----------
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let raf = 0, visible = true, last = performance.now(), time = 0;
      rigs.forEach((r, i) => (r.swivel.rotation.y = r.photo ? 0.25 * r.dir : [0.5, -0.25, 0.9, -0.7][i % 4]));

      const ripple = (r: Rig) => {
        const c = r.cloth!;
        const pos = c.geo.getAttribute("position") as BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const bx = c.base[i * 3], by = c.base[i * 3 + 1];
          const down = clamp01(-by / c.h); // 0 at the hanger, 1 at the hem
          const bend = -0.16 * (bx / (c.w / 2)) ** 2; // the sheet wraps a little, like a body shape
          const wave = reduce ? 0 : 0.035 * down * Math.sin(by * 2.4 + time * 1.4 + r.phase) + 0.015 * down * Math.sin(bx * 3 + time * 1.1);
          pos.setZ(i, bend + wave);
        }
        pos.needsUpdate = true;
        c.geo.computeVertexNormals();
      };

      const render = (dt: number) => {
        time += dt;
        for (const r of rigs) {
          const isHover = r.slug === hovered;
          if (!reduce) {
            r.pivot.rotation.z = 0.035 * Math.sin(time * 0.85 + r.phase) + 0.012 * Math.sin(time * 1.9 + r.phase * 2);
            r.pivot.rotation.x = 0.025 * Math.sin(time * 0.6 + r.phase);
            if (r.photo) {
              // a photo is flat, so it turns left and right instead of spinning all the way round
              r.swivel.rotation.y += ((isHover ? 0 : 0.8 * Math.sin(time * 0.32 + r.phase) * r.dir) - r.swivel.rotation.y) * Math.min(1, dt * 2);
            } else {
              r.swivel.rotation.y += (isHover ? 0.08 : 0.32) * dt * r.dir;
            }
          }
          if (r.cloth) ripple(r);
          const s = r.body.scale.x + ((isHover ? 1.04 : 1) - r.body.scale.x) * Math.min(1, dt * 8);
          r.body.scale.setScalar(s);
        }
        camOffset.lerp(parallax, Math.min(1, dt * 2.5));
        camera.position.set(camOffset.x * 0.45, target.y + 1.0 - camOffset.y * 0.25, baseZ);
        camera.lookAt(target);
        renderer.render(scene, camera);
      };
      const loop = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        render(dt);
        raf = !reduce && visible && !document.hidden ? requestAnimationFrame(loop) : 0;
      };
      const start = () => {
        if (!raf && visible && !document.hidden) {
          last = performance.now();
          raf = requestAnimationFrame(loop);
        }
      };
      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible) start();
      });
      io.observe(el);
      const onVis = () => !document.hidden && start();
      document.addEventListener("visibilitychange", onVis);
      if (reduce) render(0);
      else start();

      return () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerleave", onLeave);
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointerup", onUp);
        disposables.forEach((d) => d.dispose());
        scene.traverse((o) => ((o as Mesh).material as Material | undefined)?.dispose?.());
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={host} className="hanger-scene" />;
}
