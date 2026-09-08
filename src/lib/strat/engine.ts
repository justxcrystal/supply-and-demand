import type { Analysis, Candle, Setup, Zone, ZoneType } from "./types";

function avg(a: number[]): number {
  return a.reduce((x, y) => x + y, 0) / a.length;
}

/** Supply and Demand — buy fresh demand, sell fresh supply. Do not alter this engine. */
export function detectZones(candles: Candle[]): Analysis {
  if (!candles || candles.length < 30) {
    return { zones: [], signal: "WAIT", setup: null, bias: "neutral" };
  }
  const n = candles.length;
  const last = candles[n - 1];
  const look = candles.slice(-80);
  const ranges = look.map((k) => k.h - k.l);
  const atr = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const zones: Zone[] = [];

  const isBase = (i: number) => {
    const body = Math.abs(candles[i].c - candles[i].o);
    return body < atr * 0.45 && candles[i].h - candles[i].l < atr * 1.15;
  };

  for (let i = 8; i < n - 6; i++) {
    if (!isBase(i) && !isBase(i - 1)) continue;
    let a = i;
    let b = i;
    while (a > 4 && isBase(a - 1)) a--;
    while (b < n - 4 && isBase(b + 1)) b++;
    i = b;
    const base = candles.slice(a, b + 1);
    const top = Math.max(...base.map((k) => k.h));
    const bot = Math.min(...base.map((k) => k.l));
    if (top - bot > atr * 1.8) continue;
    const before = candles[a - 1];
    const after = candles[b + 1];
    if (!before || !after) continue;
    const depart = after.c - (top + bot) / 2;
    const move = Math.max(...candles.slice(b + 1, Math.min(n, b + 8)).map((k) => k.h)) - bot;
    const drop = top - Math.min(...candles.slice(b + 1, Math.min(n, b + 8)).map((k) => k.l));
    let type: ZoneType | null = null;
    if (depart > atr * 1.1 && move > atr * 1.6) type = "DEMAND";
    if (depart < -atr * 1.1 && drop > atr * 1.6) type = "SUPPLY";
    if (!type) continue;
    const touched = candles.slice(b + 2).filter((k) => k.l <= top && k.h >= bot).length;
    const fresh = touched <= 1;
    const distal = type === "DEMAND" ? bot : top;
    const proximal = type === "DEMAND" ? top : bot;
    zones.push({
      type,
      a,
      b,
      top,
      bot,
      distal,
      proximal,
      fresh,
      touches: touched,
      score: Math.min(
        99,
        Math.round((Math.abs(depart) / atr) * 18 + (fresh ? 25 : 8) + (touched === 0 ? 15 : 0)),
      ),
    });
  }

  zones.sort((x, y) => y.b - x.b);
  const recent = zones.slice(0, 8);
  const smaFast = avg(candles.slice(-20).map((k) => k.c));
  const smaSlow = avg(candles.slice(-50).map((k) => k.c));
  const bias = smaFast >= smaSlow ? "bull" : "bear";

  let setup: Setup | null = null;
  for (const z of recent) {
    const inZone =
      (last.c <= z.top && last.c >= z.bot) ||
      (z.type === "DEMAND" && last.l <= z.top && last.c > z.bot) ||
      (z.type === "SUPPLY" && last.h >= z.bot && last.c < z.top);
    const near = Math.abs(last.c - (z.top + z.bot) / 2) < atr * 1.4;
    if (!near && !inZone) continue;
    if (z.type === "DEMAND" && bias === "bear" && z.score < 55) continue;
    if (z.type === "SUPPLY" && bias === "bull" && z.score < 55) continue;
    const entry = (z.proximal + z.distal) / 2;
    const sl = z.type === "DEMAND" ? z.distal - atr * 0.25 : z.distal + atr * 0.25;
    const risk = Math.abs(entry - sl);
    const tp1 = z.type === "DEMAND" ? entry + risk * 2 : entry - risk * 2;
    const tp2 = z.type === "DEMAND" ? entry + risk * 3.5 : entry - risk * 3.5;
    setup = {
      ...z,
      entry,
      sl,
      tp1,
      tp2,
      atr,
      rr: 2,
      signal: z.type === "DEMAND" ? "BUY" : "SELL",
      reason: z.fresh
        ? "Fresh unmitigated zone + departure impulse"
        : "Zone retest " + z.touches,
    };
    break;
  }

  const signal = setup ? setup.signal : "WAIT";
  return { zones: recent, signal, setup, bias, atr, last };
}
