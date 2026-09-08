import { detectAmd } from "./amd";
import { diagnose } from "./diagnose";
import { detectZones } from "./engine";
import { rTargets } from "./targets";
import type { Analysis, Candle, Setup } from "./types";

function atrOf(c: Candle[]) {
  const s = c.slice(-20);
  return s.reduce((a, k) => a + (k.h - k.l), 0) / Math.max(1, s.length);
}

/** Compose frozen S&D zones + AMD. Never edits detectZones. */
export function analyzeMarket(candles: Candle[]): Analysis {
  const raw = detectZones(candles);
  const amd = detectAmd(candles, raw.zones);
  const atr = raw.atr ?? atrOf(candles);
  const last = candles.at(-1);
  const z = amd.zone ?? raw.zones[0];

  let setup: Setup | null = null;
  if (z && last) {
    const side = z.type === "DEMAND" ? "BUY" : "SELL";
    const entry = z.proximal;
    let sl =
      amd.manip != null
        ? side === "BUY"
          ? amd.manip.extreme - atr * 0.15
          : amd.manip.extreme + atr * 0.15
        : side === "BUY"
          ? z.distal - atr * 0.25
          : z.distal + atr * 0.25;
    if (side === "BUY") sl = Math.min(sl, z.distal - atr * 0.08);
    else sl = Math.max(sl, z.distal + atr * 0.08);
    const tps = rTargets(entry, sl, side);
    setup = {
      ...z,
      entry,
      sl,
      tps,
      tp1: tps[0],
      tp2: tps[1],
      atr,
      rr: 1,
      signal: side,
      reason: amd.mss
        ? "AMD distribution · retest of accumulation"
        : "Impulse from base · waiting for sweep",
    };
  }

  const issues = diagnose({ ...raw, setup }, amd, candles);
  if (!setup || !last || !z) {
    return { ...raw, setup, signal: "WAIT", amd, issues, executable: false };
  }

  const risk = Math.abs(setup.entry - setup.sl) || atr;
  const iLast = candles.length - 1;
  const afterDist = amd.dist != null && iLast > amd.dist.i;
  const inZone = last.c <= z.top && last.c >= z.bot;
  const tapped = inZone || (last.l <= z.top && last.h >= z.bot);
  const held = setup.signal === "BUY" ? last.c >= z.bot : last.c <= z.top;
  let impulse = 0;
  if (amd.dist) {
    const run = candles.slice(amd.dist.i, iLast + 1);
    impulse =
      setup.signal === "BUY"
        ? Math.max(...run.map((k) => k.h)) - setup.entry
        : setup.entry - Math.min(...run.map((k) => k.l));
  }
  const runNow =
    setup.signal === "BUY" ? (last.c - setup.entry) / risk : (setup.entry - last.c) / risk;
  const third = z.touches >= 3;
  const executable =
    amd.phase === "distribution" &&
    amd.mss &&
    afterDist &&
    tapped &&
    held &&
    impulse >= risk * 0.7 &&
    runNow <= 1.25 &&
    !third;

  return {
    ...raw,
    setup,
    signal: executable ? setup.signal : "WAIT",
    amd,
    issues,
    executable,
  };
}
