const ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL"];

const key = (s: string): [number, string] => {
  const u = s.toUpperCase();
  const i = ORDER.indexOf(u);
  if (i >= 0) return [i, u];
  if (/^\d+$/.test(u)) return [100 + Number(u), u];
  return [1000, u];
};

export function compareSizes(a: string, b: string): number {
  const [ka, sa] = key(a);
  const [kb, sb] = key(b);
  return ka - kb || sa.localeCompare(sb);
}

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort(compareSizes);
}

export const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
export const WAIST_SIZES = ["28", "30", "32", "34", "36", "38", "40"];
