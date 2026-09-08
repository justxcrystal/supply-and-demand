import { analyzeMarket } from "./analyze";
import type { BacktestStats, Candle } from "./types";

const RISK = 250;

/**
 * Walk-forward AMD: enter next bar after a distribution retest.
 * TP1 = 1R, SL = 1R. Same-bar SL is ignored on the fill (fill is the retest wick).
 */
export function walkForward(candles: Candle[]): BacktestStats {
  const empty: BacktestStats = {
    trades: 0,
    wins: 0,
    losses: 0,
    pnl: 0,
    netR: 0,
    winRate: 0,
    expectancy: 0,
    maxDd: 0,
    curve: [0],
  };
  if (!candles || candles.length < 50) return empty;

  let open: { side: "BUY" | "SELL"; sl: number; tp1: number; from: number } | null = null;
  let cooldown = 0;
  let pnl = 0;
  let peak = 0;
  let maxDd = 0;
  let wins = 0;
  let losses = 0;
  let netR = 0;
  const curve: number[] = [0];

  const close = (r: number) => {
    pnl += r * RISK;
    netR += r;
    if (r > 0) wins += 1;
    else losses += 1;
    if (pnl > peak) peak = pnl;
    const dd = peak - pnl;
    if (dd > maxDd) maxDd = dd;
    curve.push(pnl);
    open = null;
    cooldown = 3;
  };

  for (let i = 50; i < candles.length; i++) {
    const last = candles[i];
    if (open) {
      if (i <= open.from) continue;
      if (open.side === "BUY") {
        const hitSl = last.l <= open.sl;
        const hitTp = last.h >= open.tp1;
        if (hitTp && hitSl) {
          if (last.c >= (open.sl + open.tp1) / 2) close(1);
          else close(-1);
        } else if (hitTp) close(1);
        else if (hitSl) close(-1);
      } else {
        const hitSl = last.h >= open.sl;
        const hitTp = last.l <= open.tp1;
        if (hitTp && hitSl) {
          if (last.c <= (open.sl + open.tp1) / 2) close(1);
          else close(-1);
        } else if (hitTp) close(1);
        else if (hitSl) close(-1);
      }
      continue;
    }
    if (cooldown > 0) {
      cooldown -= 1;
      continue;
    }
    const a = analyzeMarket(candles.slice(0, i + 1));
    if (a.executable && a.setup && a.setup.signal !== "WAIT") {
      open = {
        side: a.setup.signal,
        sl: a.setup.sl,
        tp1: a.setup.tps?.[0] ?? a.setup.tp1,
        from: i,
      };
    }
  }

  const trades = wins + losses;
  return {
    trades,
    wins,
    losses,
    pnl,
    netR,
    winRate: trades ? (wins / trades) * 100 : 0,
    expectancy: trades ? netR / trades : 0,
    maxDd,
    curve,
  };
}
