import type { AmdModel, Analysis, BacktestStats, Candle, Issue } from "./types";

export function diagnose(
  raw: Analysis,
  amd: AmdModel,
  candles: Candle[],
  bt?: BacktestStats,
): Issue[] {
  const out: Issue[] = [];
  const z = amd.zone ?? raw.zones[0];
  const setup = raw.setup;
  const last = candles.at(-1);

  if (amd.phase === "accumulation") {
    out.push({
      level: "block",
      title: "Still in accumulation",
      detail: "Range is building. AMD waits — no order until distribution.",
    });
  }
  if (amd.phase === "manipulation") {
    out.push({
      level: "block",
      title: "Manipulation / liquidity grab",
      detail: "This is the trap. Do not buy the sweep or sell the spike. Wait for displacement.",
    });
  }
  if (amd.phase !== "distribution") {
    out.push({
      level: "block",
      title: "Not in distribution",
      detail: "Desk only executes in distribution after the grab. Signal forced to WAIT.",
    });
  } else if (!amd.mss) {
    out.push({
      level: "warn",
      title: "Distribution without a sweep",
      detail: "Impulse left the base but no liquidity grab printed. Weaker AMD. Standing aside.",
    });
  }

  if (z && z.touches >= 3) {
    out.push({
      level: "block",
      title: `3rd-touch rule broken (${z.touches} taps)`,
      detail: "Engine still scores this zone. Rule is skip the 3rd tap. We block the fill.",
    });
  }
  if (z && !z.fresh) {
    out.push({
      level: "warn",
      title: "Zone is not fresh",
      detail: "Touched already. First tap is A+, second is optional, third is dead.",
    });
  }
  if (setup && last) {
    const r = Math.abs(setup.entry - setup.sl) || 1;
    const run = setup.signal === "BUY" ? (last.c - setup.entry) / r : (setup.entry - last.c) / r;
    if (run > 2) {
      out.push({
        level: "block",
        title: `Chasing — already +${run.toFixed(1)}R`,
        detail: "Distribution already ran. Retest in is the trade, not FOMO at TP3+.",
      });
    }
    if (Math.abs(setup.entry - setup.proximal) < r * 0.05) {
      out.push({
        level: "info",
        title: "Proximal entry",
        detail: "Fill is the edge of the base. Stop sits beyond the sweep.",
      });
    }
  }
  if (raw.setup && raw.bias === "bear" && raw.setup.signal === "BUY") {
    out.push({
      level: "block",
      title: "Counter-trend BUY",
      detail: "Overall trend is bear. Auto only sells supply in a downtrend.",
    });
  }
  if (raw.setup && raw.bias === "bull" && raw.setup.signal === "SELL") {
    out.push({
      level: "block",
      title: "Counter-trend SELL",
      detail: "Overall trend is bull. Auto only buys demand in an uptrend.",
    });
  }
  if (setup && setup.score < 55) {
    out.push({
      level: "warn",
      title: `Quality ${setup.score}/99`,
      detail: "Weak departure. AMD wants a clean impulse out of the range.",
    });
  }
  if (bt && bt.trades >= 3 && bt.expectancy < 0) {
    out.push({
      level: "warn",
      title: `Walk-forward expectancy ${bt.expectancy.toFixed(2)}R`,
      detail: "Raw S&D (no AMD gate) is negative on this chart. Distribution filter is the patch.",
    });
  }
  if (!z) {
    out.push({
      level: "info",
      title: "No base on this window",
      detail: "Need a tight accumulation before AMD can start.",
    });
  }
  if (!out.length) {
    out.push({
      level: "info",
      title: "Distribution is live",
      detail: "Sweep printed, displacement confirmed, zone still valid. Continuation is the trade.",
    });
  }
  return out;
}
