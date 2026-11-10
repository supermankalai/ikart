/**
 * Built-in starter clipart (original simple icons, 100×100, one colour so customers can recolour them).
 * More art can be added by the admin in Admin → Clipart.
 */
import type { Clipart } from "./types";

const circ = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const star = (cx: number, cy: number, points: number, outer: number, inner: number, rot = -90) => {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
};
const flower = () => {
  let d = circ(50, 50, 13);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    d += circ(50 + 25 * Math.cos(a), 50 + 25 * Math.sin(a), 16);
  }
  return d;
};
const sun = () => {
  let d = circ(50, 50, 20);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const p = (r: number, da: number) => `${(50 + r * Math.cos(a + da)).toFixed(1)} ${(50 + r * Math.sin(a + da)).toFixed(1)}`;
    d += `M${p(27, -0.13)}L${p(46, 0)}L${p(27, 0.13)}Z`;
  }
  return d;
};

const ART: { name: string; category: string; d: string; evenodd?: boolean }[] = [
  { name: "Star", category: "Shapes", d: star(50, 52, 5, 46, 19) },
  { name: "Burst", category: "Shapes", d: star(50, 50, 14, 47, 34) },
  { name: "Heart", category: "Shapes", d: "M50 88C20 66 6 50 6 32C6 18 17 8 30 8C39 8 46 13 50 20C54 13 61 8 70 8C83 8 94 18 94 32C94 50 80 66 50 88Z" },
  { name: "Lightning", category: "Shapes", d: "M60 4L20 56H46L38 96L80 42H54Z" },
  { name: "Crown", category: "Shapes", d: "M10 76L16 28L36 50L50 16L64 50L84 28L90 76ZM10 82H90V92H10Z" },
  { name: "Diamond", category: "Shapes", d: "M30 12H70L92 38L50 92L8 38Z" },
  { name: "Ring badge", category: "Shapes", d: circ(50, 50, 45) + circ(50, 50, 33), evenodd: true },
  { name: "Speech bubble", category: "Shapes", d: "M10 14H90V66H44L24 88V66H10Z" },
  { name: "Sun", category: "Nature", d: sun() },
  { name: "Moon", category: "Nature", d: "M64 8A42 42 0 1 0 92 66A34 34 0 1 1 64 8Z" },
  { name: "Flower", category: "Nature", d: flower() },
  { name: "Leaf", category: "Nature", d: "M18 84C18 42 44 14 88 12C86 56 60 82 18 84Z" },
  { name: "Mountains", category: "Nature", d: "M4 86L36 32L52 56L66 38L96 86Z" },
  { name: "Wave", category: "Nature", d: "M4 58C20 38 36 38 50 58C64 78 80 78 96 58V94H4Z" },
  { name: "Flame", category: "Nature", d: "M50 4C58 26 80 36 80 62C80 82 66 96 50 96C34 96 20 82 20 62C20 46 30 38 36 26C40 40 44 44 50 46C48 30 46 18 50 4Z" },
  { name: "Paw", category: "Animals", d: ell(50, 66, 22, 18) + ell(22, 42, 9, 12) + ell(40, 24, 9, 12) + ell(60, 24, 9, 12) + ell(78, 42, 9, 12) },
  { name: "Fish", category: "Animals", d: "M10 50C30 22 64 22 78 50C64 78 30 78 10 50ZM78 50L96 30V70Z" + circ(30, 46, 5), evenodd: true },
  { name: "Cat", category: "Animals", d: "M16 44L20 10L42 28H58L80 10L84 44A34 32 0 1 1 16 44Z" + ell(36, 52, 5, 7) + ell(64, 52, 5, 7), evenodd: true },
  { name: "Bird", category: "Animals", d: "M8 56C28 40 46 44 56 52C66 34 80 28 94 30C84 38 80 48 78 58C70 80 40 86 22 74C32 70 38 66 40 62C28 64 16 62 8 56Z" },
  { name: "Smiley", category: "Fun", d: circ(50, 50, 45) + ell(35, 38, 6, 8) + ell(65, 38, 6, 8) + "M28 58Q50 82 72 58Q50 70 28 58Z", evenodd: true },
  { name: "Music", category: "Fun", d: "M38 14L84 6V66A12 10 0 1 1 74 56V24L48 28V74A12 10 0 1 1 38 64Z" },
  { name: "Game", category: "Fun", d: "M24 30H76C88 30 96 44 96 60C96 74 86 80 78 72L68 62H32L22 72C14 80 4 74 4 60C4 44 12 30 24 30Z" + "M24 42h6v6h6v6h-6v6h-6v-6h-6v-6h6Z" + circ(70, 46, 4) + circ(78, 54, 4), evenodd: true },
  { name: "Trophy", category: "Sports", d: "M26 8H74V30C74 50 62 60 54 62V74H66V88H34V74H46V62C38 60 26 50 26 30Z" },
  { name: "Ball", category: "Sports", d: circ(50, 50, 45) + star(50, 50, 5, 17, 14), evenodd: true },
  { name: "Cricket", category: "Sports", d: "M66 6L78 18L42 66L32 56ZM32 56L42 66L20 90L10 80Z" + circ(78, 76, 11) },
  { name: "Dumbbell", category: "Sports", d: "M6 40H16V28H28V72H16V60H6ZM94 40H84V28H72V72H84V60H94ZM28 45H72V55H28Z" },
];

const toUrl = (d: string, evenodd?: boolean) =>
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="600" height="600"><path fill="currentColor"${evenodd ? ' fill-rule="evenodd"' : ""} d="${d}"/></svg>`,
  );

export const STARTER_CLIPART: Clipart[] = ART.map((a, i) => ({ id: -1 - i, name: a.name, category: a.category, url: toUrl(a.d, a.evenodd) }));

/** Starter art can be recoloured exactly (SVG); uploaded PNG art is recoloured as a silhouette. */
export const isVectorArt = (url: string) => url.startsWith("data:image/svg+xml") || url.endsWith(".svg");
