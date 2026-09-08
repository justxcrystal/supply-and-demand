import type { Signal } from "./types";

/** TP1–TP6 at 1R through 6R. */
export function rTargets(entry: number, sl: number, side: "BUY" | "SELL"): number[] {
  const r = Math.abs(entry - sl) || 1;
  const dir = side === "BUY" ? 1 : -1;
  return [1, 2, 3, 4, 5, 6].map((n) => entry + dir * r * n);
}

export function tpIndex(at: string): number | null {
  const m = /^tp([1-6])$/.exec(at);
  return m ? Number(m[1]) - 1 : null;
}

export function isBuySell(s: Signal): s is "BUY" | "SELL" {
  return s === "BUY" || s === "SELL";
}

/** Highest TP index (0=TP1) tagged by price. -1 if none. */
export function taggedTp(side: "BUY" | "SELL", tps: number[], price: number): number {
  let hit = -1;
  for (let i = 0; i < tps.length; i++) {
    if (side === "BUY" && price >= tps[i]) hit = i;
    if (side === "SELL" && price <= tps[i]) hit = i;
  }
  return hit;
}

/**
 * Auto BE at TP2, then trail two TPs behind.
 * TP3 → SL at TP1, TP4 → TP2, TP5 → TP3, TP6 → TP4.
 */
export function trailStop(
  side: "BUY" | "SELL",
  entry: number,
  initSl: number,
  tps: number[],
  price: number,
): { sl: number; hit: number; label: string } {
  const hit = taggedTp(side, tps, price);
  let sl = initSl;
  let label = "INIT";
  if (hit >= 1) {
    sl = entry;
    label = "BE";
  }
  if (hit >= 2) {
    sl = tps[hit - 2];
    label = `TP${hit - 1}`;
  }
  if (side === "BUY") sl = Math.max(sl, initSl);
  else sl = Math.min(sl, initSl);
  return { sl, hit, label };
}
