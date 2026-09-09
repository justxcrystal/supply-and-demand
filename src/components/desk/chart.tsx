import { useEffect, useRef } from "react";
import { fmt, marketById } from "@/lib/strat/universe";
import type { Analysis, Candle } from "@/lib/strat/types";

export function toHeikin(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const k = candles[i];
    const c = (k.o + k.h + k.l + k.c) / 4;
    const prev = out[i - 1];
    const o = prev ? (prev.o + prev.c) / 2 : (k.o + k.c) / 2;
    out.push({
      t: k.t,
      o,
      c,
      h: Math.max(k.h, o, c),
      l: Math.min(k.l, o, c),
      v: k.v,
    });
  }
  return out;
}

function cssColor(name: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function drawDeskChart(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  args: {
    symbol: string;
    candles: Candle[];
    analysis?: Analysis;
    ha?: boolean;
    trade?: { side: "BUY" | "SELL"; entry: number; exit: number };
  },
) {
  const buy = cssColor("--color-buy", "#3ee8a0");
  const sell = cssColor("--color-sell", "#ff5d73");
  const muted = cssColor("--color-muted", "#6a7c7a");
  const entry = cssColor("--color-entry", "#4ecdc4");
  const stop = cssColor("--color-fg", "#c8d6d4");
  const meta = marketById(args.symbol);
  ctx.fillStyle = "#070b10";
  ctx.fillRect(0, 0, w, h);
  if (!args.candles.length) return;
  const bars = args.ha ? toHeikin(args.candles) : args.candles;
  const padL = 10;
  const padR = 68;
  const padT = 8;
  const padB = 18;
  const s = args.analysis?.setup;
  const tps = s?.tps ?? [];
  const prices = bars.flatMap((k) => [k.l, k.h]);
  if (s) prices.push(s.sl, s.entry, ...tps);
  if (args.trade) prices.push(args.trade.entry, args.trade.exit);
  const lo0 = Math.min(...prices);
  const hi0 = Math.max(...prices);
  const pad = (hi0 - lo0) * 0.04 || 1;
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const span = hi - lo || 1;
  const x = (i: number) => padL + i * ((w - padL - padR) / Math.max(1, bars.length - 1));
  const y = (p: number) => padT + (1 - (p - lo) / span) * (h - padT - padB);
  const lastI = bars.length - 1;

  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, w - padL - padR, h - padT - padB);
  ctx.clip();

  ctx.strokeStyle = `${entry}14`;
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    const gy = padT + ((h - padT - padB) * i) / 6;
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(w - padR, gy);
    ctx.stroke();
  }

  const amd = args.analysis?.amd;
  if (amd?.acc) {
    const plotRight = w - padR;
    const step = (plotRight - padL) / Math.max(1, bars.length - 1);
    const band = (a: number, b: number, label: string, color: string) => {
      const left = Math.max(padL, x(Math.max(0, a)) - step / 2);
      const right = Math.min(plotRight, x(Math.min(lastI, Math.max(a, b))) + step / 2);
      if (right <= left) return;
      ctx.fillStyle = color;
      ctx.fillRect(left, padT, right - left, h - padT - padB);
      ctx.fillStyle = "rgba(235,245,243,.82)";
      ctx.font = "bold 9px IBM Plex Mono, ui-monospace, monospace";
      ctx.fillText(label, left + 4, padT + 12);
    };
    const manipI = amd.manip?.i;
    const distI = amd.dist?.i;
    let retestI = -1;
    if (distI != null && amd.zone) {
      for (let i = distI + 1; i <= lastI; i++) {
        if (bars[i].l <= amd.zone.top && bars[i].h >= amd.zone.bot) {
          retestI = i;
          break;
        }
      }
    }
    band(amd.acc.a, amd.acc.b, "ACCUMULATION", "rgba(78,205,196,.10)");
    if (manipI != null) band(manipI, Math.min(lastI, manipI + 1), "MANIPULATION / SWEEP", "rgba(255,93,115,.13)");
    if (distI != null) band(distI, retestI >= 0 ? Math.max(distI, retestI - 1) : lastI, "DISTRIBUTION / IMPULSE", "rgba(255,190,92,.11)");
    if (retestI >= 0) {
      band(retestI, Math.min(lastI, retestI + 1), "CORRECTION / RETEST", "rgba(139,124,255,.14)");
      if (retestI + 1 <= lastI) band(retestI + 1, lastI, "CONTINUATION", "rgba(62,232,160,.10)");
    }
  }

  const zone = args.analysis?.amd?.zone ?? args.analysis?.zones?.[0];
  if (zone) {
    const zx = x(Math.max(0, zone.a));
    const zw = x(lastI) - zx;
    ctx.fillStyle = zone.type === "DEMAND" ? "rgba(62,232,160,.10)" : "rgba(255,107,122,.10)";
    ctx.fillRect(zx, y(zone.top), zw, y(zone.bot) - y(zone.top));
    ctx.strokeStyle = zone.type === "DEMAND" ? "rgba(62,232,160,.45)" : "rgba(255,107,122,.45)";
    ctx.lineWidth = 1;
    ctx.strokeRect(zx, y(zone.top), zw, y(zone.bot) - y(zone.top));
  }

  if (amd?.manip) {
    ctx.strokeStyle = "rgba(255,107,122,.45)";
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x(amd.manip.i), y(amd.manip.extreme));
    ctx.lineTo(x(lastI), y(amd.manip.extreme));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (s) {
    dash(ctx, padL, w - padR, y(s.entry), entry, 1);
    dash(ctx, padL, w - padR, y(s.sl), stop, 1);
    tps.forEach((p, i) => {
      const yy = y(p);
      if (yy < padT || yy > h - padB) return;
      dash(ctx, padL, w - padR, yy, buy, i === 0 || i === 5 ? 1.35 : 1);
    });
  }

  if (args.trade) {
    dash(ctx, padL, w - padR, y(args.trade.entry), entry, 1.4);
    ctx.strokeStyle = args.trade.side === "BUY" ? buy : sell;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(padL, y(args.trade.exit));
    ctx.lineTo(w - padR, y(args.trade.exit));
    ctx.stroke();
  }

  const cw = Math.max(2, ((w - padL - padR) / bars.length) * 0.62);
  bars.forEach((k, i) => {
    const up = k.c >= k.o;
    ctx.strokeStyle = ctx.fillStyle = up ? buy : sell;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x(i), y(k.h));
    ctx.lineTo(x(i), y(k.l));
    ctx.stroke();
    const top = y(Math.max(k.o, k.c));
    const bot = y(Math.min(k.o, k.c));
    ctx.fillRect(x(i) - cw / 2, top, cw, Math.max(1, bot - top));
  });
  ctx.restore();

  ctx.font = "10px IBM Plex Mono, ui-monospace, monospace";
  ctx.fillStyle = muted;
  ctx.fillText(fmt(meta, hi), w - padR + 6, 18);
  ctx.fillText(fmt(meta, lo), w - padR + 6, h - 6);
  const lastRaw = args.candles[args.candles.length - 1];
  const lastHa = bars[lastI];
  const py = Math.min(h - padB - 4, Math.max(20, y(args.ha ? lastHa.c : lastRaw.c)));
  ctx.fillStyle = lastHa.c >= lastHa.o ? buy : sell;
  ctx.fillText(fmt(meta, lastRaw.c), w - padR + 6, py);
  if (s) {
    const used: number[] = [];
    const place = (raw: number) => {
      let yy = Math.min(h - padB - 4, Math.max(16, raw));
      for (let n = 0; n < 8; n++) {
        const hit = used.find((u) => Math.abs(u - yy) < 11);
        if (!hit) break;
        yy = hit + (raw >= hit ? 11 : -11);
        yy = Math.min(h - padB - 4, Math.max(16, yy));
      }
      used.push(yy);
      return yy;
    };
    ctx.fillStyle = entry;
    ctx.fillText("IN", w - padR + 6, place(y(s.entry) + 3));
    ctx.fillStyle = muted;
    ctx.fillText("SL", w - padR + 6, place(y(s.sl) + 3));
    tps.forEach((p, i) => {
      const yy = y(p);
      if (yy < padT - 2 || yy > h - padB + 2) return;
      ctx.fillStyle = buy;
      ctx.fillText(`TP${i + 1}`, w - padR + 6, place(yy + 3));
    });
    if (args.trade) {
      ctx.fillStyle = args.trade.side === "BUY" ? buy : sell;
      ctx.fillText("OUT", w - padR + 6, place(y(args.trade.exit) + 3));
    }
  } else if (args.trade) {
    ctx.fillStyle = entry;
    ctx.fillText("IN", w - padR + 6, y(args.trade.entry) + 3);
    ctx.fillStyle = args.trade.side === "BUY" ? buy : sell;
    ctx.fillText("OUT", w - padR + 6, y(args.trade.exit) + 3);
  }
}

export function PriceChart({
  symbol,
  candles,
  analysis,
  ha,
}: {
  symbol: string;
  candles: Candle[];
  analysis: Analysis | undefined;
  ha?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawDeskChart(ctx, w, h, { symbol, candles, analysis, ha });
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [symbol, candles, analysis, ha]);

  return <canvas ref={ref} data-sd-chart="" className="block h-full w-full" />;
}

function dash(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, color: string, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
}
