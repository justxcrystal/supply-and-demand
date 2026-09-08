import type { AmdModel, Candle, Zone } from "./types";

function atrOf(c: Candle[], n = 20) {
  const slice = c.slice(-n);
  if (!slice.length) return 1;
  return slice.reduce((s, k) => s + (k.h - k.l), 0) / slice.length;
}

function modelFor(candles: Candle[], z: Zone, atr: number): AmdModel {
  const n = candles.length;
  const last = candles[n - 1];
  const acc = { a: z.a, b: z.b, top: z.top, bot: z.bot };
  const side = z.type === "DEMAND" ? ("BUY" as const) : ("SELL" as const);

  let manipI = -1;
  let manipExt = 0;
  for (let i = z.b + 1; i < n; i++) {
    const k = candles[i];
    if (z.type === "DEMAND" && k.l < z.bot && k.c > z.bot) {
      manipI = i;
      manipExt = k.l;
      break;
    }
    if (z.type === "SUPPLY" && k.h > z.top && k.c < z.top) {
      manipI = i;
      manipExt = k.h;
      break;
    }
  }

  const start = manipI >= 0 ? manipI + 1 : z.b + 1;
  let distI = -1;
  for (let i = start; i < n; i++) {
    const k = candles[i];
    if (z.type === "DEMAND" && k.c > z.top + atr * 0.08) {
      distI = i;
      break;
    }
    if (z.type === "SUPPLY" && k.c < z.bot - atr * 0.08) {
      distI = i;
      break;
    }
  }

  const inRange = last.c <= z.top && last.c >= z.bot;
  const newSweep =
    z.type === "DEMAND"
      ? last.l < (manipI >= 0 ? manipExt : z.bot) && last.c <= z.top
      : last.h > (manipI >= 0 ? manipExt : z.top) && last.c >= z.bot;

  let phase: AmdModel["phase"] = "accumulation";
  if (distI < 0 && (newSweep || (manipI >= 0 && inRange))) phase = "manipulation";
  else if (distI >= 0) phase = "distribution";
  else if (inRange) phase = "accumulation";

  return {
    phase,
    side,
    mss: manipI >= 0,
    acc,
    zone: z,
    manip: manipI >= 0 ? { i: manipI, extreme: manipExt } : undefined,
    dist: distI >= 0 ? { i: distI } : undefined,
  };
}

export function detectAmd(candles: Candle[], zones: Zone[]): AmdModel {
  const empty: AmdModel = { phase: "none", side: null, mss: false };
  if (candles.length < 30 || !zones.length) return empty;
  const atr = atrOf(candles);
  const n = candles.length;
  let fallback: AmdModel | null = null;
  for (const z of zones) {
    const m = modelFor(candles, z, atr);
    if (m.mss && m.dist && n - 1 - (m.dist.i ?? n) <= 10 && z.touches <= 2) return m;
    if (!fallback) fallback = m;
  }
  return fallback ?? empty;
}
