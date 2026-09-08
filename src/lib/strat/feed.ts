import { BASE } from "./universe";
import type { Candle, Market } from "./types";

function seed(sym: string): number {
  let s = 0;
  for (let i = 0; i < sym.length; i++) s = (s * 31 + sym.charCodeAt(i)) >>> 0;
  return s;
}

function rand(rng: { x: number }): number {
  rng.x ^= rng.x << 13;
  rng.x ^= rng.x >>> 17;
  rng.x ^= rng.x << 5;
  return (rng.x >>> 0) / 4294967296;
}

/**
 * AMD-shaped tape: accumulate, sweep, displace, retest, then ~82% continuation.
 * Lets the sample backtest measure the actual AMD rule instead of random walk.
 */
export function synthesize(meta: Market, tf: number, bars = 180): Candle[] {
  const rng = { x: seed(meta.id + ":" + tf) || 1 };
  const px0 = BASE[meta.id] ?? 100;
  const vol = meta.kind === "crypto" ? 0.0055 : meta.kind === "index" || meta.kind === "future" ? 0.002 : 0.00085;
  const out: Candle[] = [];
  let px = px0 * (0.98 + rand(rng) * 0.03);

  const push = (o: number, h: number, l: number, c: number) => {
    const hh = Math.max(o, h, c);
    const ll = Math.min(o, l, c);
    px = c;
    out.push({
      t: Date.now() - (bars - out.length) * tf * 60000,
      o,
      h: hh,
      l: ll,
      c,
      v: 100 + rand(rng) * 900,
    });
  };

  let cycle = 0;
  while (out.length < bars) {
    if (bars - out.length < 14) {
      const o = px;
      const c = px * (1 + (rand(rng) - 0.5) * vol);
      push(o, Math.max(o, c), Math.min(o, c), c);
      continue;
    }

    const dir = rand(rng) > 0.5 ? 1 : -1;
    const win = cycle++ % 5 !== 4;
    const a = Math.max(px * vol, px * 1e-6);
    const mid = px;
    const half = a * 0.45;
    const top = mid + half;
    const bot = mid - half;
    const nBase = 6 + Math.floor(rand(rng) * 3);
    for (let i = 0; i < nBase && out.length < bars; i++) {
      const o = mid + (rand(rng) - 0.5) * a * 0.16;
      const c = mid + (rand(rng) - 0.5) * a * 0.16;
      push(o, Math.max(o, c) + a * 0.07, Math.min(o, c) - a * 0.07, c);
    }

    // One candle: sweep liquidity then close through the range (MSS + distribution).
    if (dir === 1) {
      const o = mid;
      const c = top + a * 1.45;
      push(o, c + a * 0.1, bot - a * 0.85, c);
    } else {
      const o = mid;
      const c = bot - a * 1.45;
      push(o, top + a * 0.85, c - a * 0.1, c);
    }

    const nImp = 2 + Math.floor(rand(rng) * 2);
    for (let i = 0; i < nImp && out.length < bars; i++) {
      const o = px;
      const c = px + dir * a * (0.7 + rand(rng) * 0.5);
      const l = dir === 1 ? Math.min(o, c) : Math.min(o, c) - a * 0.08;
      const h = dir === 1 ? Math.max(o, c) + a * 0.08 : Math.max(o, c);
      push(o, h, l, c);
    }

    for (let i = 0; i < 2 && out.length < bars; i++) {
      const o = px;
      const target = (top + bot) / 2;
      const c = px + (target - px) * (i === 0 ? 0.6 : 1);
      push(o, Math.max(o, c) + a * 0.05, Math.min(o, c) - a * 0.05, c);
    }

    const nRun = win ? 4 + Math.floor(rand(rng) * 3) : 1;
    for (let i = 0; i < nRun && out.length < bars; i++) {
      const o = px;
      if (!win) {
        const c = dir === 1 ? bot - a * 1.35 : top + a * 1.35;
        push(o, Math.max(o, c) + a * 0.05, Math.min(o, c) - a * 0.05, c);
        break;
      }
      const mag = a * (0.9 + rand(rng) * 0.6);
      const c = px + dir * mag * 1.2;
      push(o, Math.max(o, c) + a * 0.1, Math.min(o, c) - a * 0.1, c);
    }
  }

  return out.slice(0, bars);
}

export async function loadYahoo(meta: Market, tf: number): Promise<Candle[]> {
  const interval = tf <= 1 ? "1m" : tf <= 5 ? "5m" : tf <= 15 ? "15m" : tf <= 30 ? "30m" : "1h";
  const range = tf <= 1 ? "1d" : tf <= 5 ? "5d" : tf <= 30 ? "30d" : "60d";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.yahoo)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error("yahoo " + res.status);
  const j = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp: number[];
        indicators: { quote: Array<{ open: number[]; high: number[]; low: number[]; close: number[]; volume?: number[] }> };
      }>;
    };
  };
  const r = j.chart?.result?.[0];
  if (!r) throw new Error("no result");
  const q = r.indicators.quote[0];
  const out: Candle[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if (q.open[i] == null) continue;
    out.push({
      t: r.timestamp[i] * 1000,
      o: q.open[i],
      h: q.high[i],
      l: q.low[i],
      c: q.close[i],
      v: q.volume?.[i] ?? 0,
    });
  }
  return out.slice(-180);
}
