function avg(a) {
  return a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
}

function atrOf(c, n = 20) {
  const slice = c.slice(-n);
  if (!slice.length) return 1;
  return slice.reduce((s, k) => s + (k.h - k.l), 0) / slice.length;
}

export function rTargets(entry, sl, side) {
  const r = Math.abs(entry - sl) || 1;
  const dir = side === "BUY" ? 1 : -1;
  return [1, 2, 3, 4, 5, 6].map((n) => entry + dir * r * n);
}

export function detectZones(candles) {
  if (!candles || candles.length < 30) {
    return { zones: [], signal: "WAIT", setup: null, bias: "neutral" };
  }
  const n = candles.length;
  const last = candles[n - 1];
  const look = candles.slice(-80);
  const ranges = look.map((k) => k.h - k.l);
  const atr = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const zones = [];

  const isBase = (i) => {
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
    let type = null;
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

  let setup = null;
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
      reason: z.fresh ? "Fresh unmitigated zone + departure impulse" : `Zone retest ${z.touches}`,
    };
    break;
  }

  return { zones: recent, signal: setup ? setup.signal : "WAIT", setup, bias, atr, last };
}

function modelFor(candles, z, atr) {
  const n = candles.length;
  const last = candles[n - 1];
  const acc = { a: z.a, b: z.b, top: z.top, bot: z.bot };
  const side = z.type === "DEMAND" ? "BUY" : "SELL";

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

  let phase = "accumulation";
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

export function detectAmd(candles, zones) {
  const empty = { phase: "none", side: null, mss: false };
  if (candles.length < 30 || !zones.length) return empty;
  const atr = atrOf(candles);
  const n = candles.length;
  let fallback = null;
  for (const z of zones) {
    const m = modelFor(candles, z, atr);
    if (m.mss && m.dist && n - 1 - (m.dist.i ?? n) <= 10 && z.touches <= 2) return m;
    if (!fallback) fallback = m;
  }
  return fallback ?? empty;
}

export function analyzeMarket(candles) {
  const raw = detectZones(candles);
  const amd = detectAmd(candles, raw.zones);
  const atr = raw.atr ?? atrOf(candles);
  const last = candles.at(-1);
  const z = amd.zone ?? raw.zones[0];

  let setup = null;
  if (z && last) {
    const side = z.type === "DEMAND" ? "BUY" : "SELL";
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
    const tps = rTargets(z.proximal, sl, side);
    setup = {
      ...z,
      entry: z.proximal,
      sl,
      tps,
      tp1: tps[0],
      tp2: tps[1],
      atr,
      rr: 1,
      signal: side,
      reason: amd.mss ? "AMD distribution · retest of accumulation" : "Impulse from base · waiting for sweep",
    };
  }

  if (!setup || !last || !z) {
    return { ...raw, setup, signal: "WAIT", amd, executable: false };
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
  const runNow = setup.signal === "BUY" ? (last.c - setup.entry) / risk : (setup.entry - last.c) / risk;
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

  return { ...raw, setup, signal: executable ? setup.signal : "WAIT", amd, executable };
}

export function isTrendAligned(analysis) {
  return (
    (analysis.signal === "BUY" && analysis.bias === "bull") ||
    (analysis.signal === "SELL" && analysis.bias === "bear")
  );
}
