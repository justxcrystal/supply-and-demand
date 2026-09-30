import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { analyzeMarket, isTrendAligned } from "./strategy.mjs";
import { loadYahoo } from "./market-data.mjs";
import { marketById } from "./universe.mjs";
import { TradeLockerClient } from "./tradelocker-client.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const statePath = resolve(here, ".state.json");

function bool(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

function num(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function config() {
  const symbols = String(process.env.BOT_SYMBOLS ?? "XAUUSD,NAS100")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  for (const s of symbols) marketById(s);
  const mode = String(process.env.BOT_MODE ?? "paper").toLowerCase();
  if (!["paper", "live"].includes(mode)) throw new Error("BOT_MODE must be paper or live");
  const tf = num("BOT_TIMEFRAME", 5);
  if (![1, 5, 15, 30, 60].includes(tf)) throw new Error("BOT_TIMEFRAME must be 1, 5, 15, 30, or 60");
  const pollSeconds = Math.max(15, num("BOT_POLL_SECONDS", 60));
  const qty = Math.max(0.0001, num("BOT_QTY", 0.01));
  const tpIndex = Math.min(6, Math.max(1, Math.round(num("BOT_TP", 6)))) - 1;
  return {
    symbols,
    mode,
    tf,
    pollSeconds,
    qty,
    tpIndex,
    requireTrend: bool("BOT_REQUIRE_TREND", true),
    once: bool("BOT_ONCE", false),
    liveTradingEnabled: bool("BOT_LIVE_TRADING", false),
    tl: {
      env: String(process.env.BOT_TL_ENV ?? "broker").toLowerCase() === "live" ? "live" : "broker",
      email: process.env.BOT_TL_EMAIL ?? "",
      password: process.env.BOT_TL_PASSWORD ?? "",
      server: process.env.BOT_TL_SERVER ?? "",
      accountNum: process.env.BOT_TL_ACCOUNT_NUM ?? "",
    },
  };
}

async function loadState() {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return { lastSignals: {}, paperPositions: [], paperClosed: [] };
  }
}

async function saveState(state) {
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

function signalKey(symbol, tf, candle, side) {
  return `${symbol}:${tf}:${candle.t}:${side}`;
}

function stamp() {
  return new Date().toISOString();
}

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ time: stamp(), event, ...fields })}\n`);
}

function managePaperPosition(state, symbol, last) {
  const pos = state.paperPositions.find((p) => p.symbol === symbol);
  if (!pos || !last) return false;
  const stopped = pos.side === "BUY" ? last.l <= pos.sl : last.h >= pos.sl;
  const targeted = pos.side === "BUY" ? last.h >= pos.tp : last.l <= pos.tp;
  if (!stopped && !targeted) return false;
  const exit = stopped ? pos.sl : pos.tp;
  const reason = stopped ? "SL" : `TP${pos.tpIndex ?? ""}`;
  state.paperPositions = state.paperPositions.filter((p) => p.id !== pos.id);
  state.paperClosed = [...(state.paperClosed ?? []), { ...pos, exit, reason, closedAt: stamp() }].slice(-200);
  log("paper_close", { symbol, side: pos.side, exit, reason });
  return true;
}

function validateLiveConfig(cfg) {
  if (cfg.mode !== "live") return;
  if (!cfg.liveTradingEnabled) {
    throw new Error("Live mode requires BOT_LIVE_TRADING=true. Use paper mode until live execution is intentionally enabled.");
  }
  const missing = [
    ["BOT_TL_EMAIL", cfg.tl.email],
    ["BOT_TL_PASSWORD", cfg.tl.password],
    ["BOT_TL_SERVER", cfg.tl.server],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")}`);
}

async function processSymbol(cfg, state, broker, symbol) {
  const meta = marketById(symbol);
  let candles;
  try {
    candles = await loadYahoo(meta, cfg.tf);
  } catch (error) {
    log("market_data_skip", { symbol, reason: error instanceof Error ? error.message : String(error) });
    return;
  }

  const analysis = analyzeMarket(candles);
  const last = candles.at(-1);
  if (cfg.mode === "paper" && managePaperPosition(state, symbol, last)) await saveState(state);
  const setup = analysis.setup;
  log("scan", {
    symbol,
    tf: cfg.tf,
    close: last?.c,
    phase: analysis.amd?.phase ?? "none",
    bias: analysis.bias,
    signal: analysis.signal,
    executable: Boolean(analysis.executable),
  });

  if (!last || !setup || !analysis.executable || analysis.signal === "WAIT") return;
  if (cfg.requireTrend && !isTrendAligned(analysis)) {
    log("signal_skip", { symbol, reason: "counter_trend", side: analysis.signal });
    return;
  }

  const key = signalKey(symbol, cfg.tf, last, analysis.signal);
  if (state.lastSignals[symbol] === key) {
    log("signal_skip", { symbol, reason: "duplicate_bar", side: analysis.signal });
    return;
  }

  const order = {
    symbol,
    side: analysis.signal,
    qty: cfg.qty,
    entry: setup.entry,
    sl: setup.sl,
    tp: setup.tps?.[cfg.tpIndex] ?? setup.tp2,
    barTime: new Date(last.t).toISOString(),
  };

  if (cfg.mode === "paper") {
    if (state.paperPositions.length >= 1) {
      log("signal_skip", { symbol, reason: "paper_position_open", side: order.side });
      return;
    }
    state.paperPositions.push({ ...order, tpIndex: cfg.tpIndex + 1, id: `${Date.now()}-${symbol}` });
    state.lastSignals[symbol] = key;
    await saveState(state);
    log("paper_order", order);
    return;
  }

  const positions = await broker.openPositions();
  if (positions.length >= 1) {
    log("signal_skip", { symbol, reason: "broker_position_open", openCount: positions.length });
    return;
  }

  await broker.placeMarketOrder(order);
  state.lastSignals[symbol] = key;
  await saveState(state);
  log("live_order_accepted", order);
}

async function cycle(cfg, state, broker) {
  for (const symbol of cfg.symbols) {
    try {
      await processSymbol(cfg, state, broker, symbol);
    } catch (error) {
      log("symbol_error", { symbol, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

async function main() {
  const cfg = config();
  validateLiveConfig(cfg);
  const state = await loadState();
  const broker = cfg.mode === "live" ? new TradeLockerClient(cfg.tl) : null;
  if (broker) {
    const account = await broker.login();
    log("broker_connected", { env: cfg.tl.env, account: account.accNum });
  }
  log("bot_start", {
    mode: cfg.mode,
    symbols: cfg.symbols,
    tf: cfg.tf,
    pollSeconds: cfg.pollSeconds,
    requireTrend: cfg.requireTrend,
    tp: cfg.tpIndex + 1,
  });

  do {
    await cycle(cfg, state, broker);
    if (cfg.once) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, cfg.pollSeconds * 1000));
  } while (true);
}

main().catch((error) => {
  log("fatal", { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
