import { create } from "zustand";
import { analyzeMarket } from "./strat/analyze";
import { walkForward } from "./strat/backtest";
import { synthesize } from "./strat/feed";
import { fetchOhlc } from "./strat/ohlc";
import { rTargets, tpIndex, trailStop } from "./strat/targets";
import { tlPlace } from "./tradelocker";
import { useTl } from "./tl-store";
import { marketById, UNIVERSE } from "./strat/universe";
import type { Analysis, BacktestStats, Candle, ClosedTrade, Position, Signal, TpKey } from "./strat/types";

export const START_EQ = 25000;
const VAULT = "sd.desk.vault.v1";

type Skin = "command" | "gamer";

type Persisted = {
  symbol?: string;
  tf?: number;
  risk?: string;
  positions?: Position[];
  closed?: ClosedTrade[];
  armed?: boolean;
  sendTl?: boolean;
  autoTp?: TpKey;
  trailOn?: boolean;
  ha?: boolean;
  flattenAtClose?: boolean;
  lastFlatDate?: string;
  skin?: Skin;
};

function loadVault(): Persisted {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(VAULT);
    return raw ? (JSON.parse(raw) as Persisted) : {};
  } catch {
    return {};
  }
}

function saveVault(s: DeskState) {
  if (typeof localStorage === "undefined") return;
  const t: Persisted = {
    symbol: s.symbol,
    tf: s.tf,
    risk: s.risk,
    positions: s.positions,
    closed: s.closed.slice(-200),
    armed: s.armed,
    sendTl: s.sendTl,
    autoTp: s.autoTp,
    trailOn: s.trailOn,
    ha: s.ha,
    flattenAtClose: s.flattenAtClose,
    lastFlatDate: s.lastFlatDate,
    skin: s.skin,
  };
  localStorage.setItem(VAULT, JSON.stringify(t));
}

export function nySession() {
  const e = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const t = e.getDay();
  const n = e.getHours() * 60 + e.getMinutes();
  const date = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
  const weekday = t >= 1 && t <= 5;
  return { ny: e, date, open: weekday && n >= 570 && n < 960, afterClose: !weekday || n >= 960, weekday };
}

export function mark(pos: Position, price: number) {
  const dir = pos.side === "BUY" ? 1 : -1;
  const dist = Math.abs(pos.entry - (pos.initSl ?? pos.sl)) || 1;
  const r = ((price - pos.entry) * dir) / dist;
  return { r, pnl: r * pos.riskAmt };
}

type DeskState = {
  symbol: string;
  tf: number;
  risk: string;
  candles: Record<string, Candle[]>;
  analysis: Record<string, Analysis>;
  backtests: Record<string, BacktestStats>;
  live: boolean;
  scanning: boolean;
  feedLabel: string;
  positions: Position[];
  closed: ClosedTrade[];
  armed: boolean;
  sendTl: boolean;
  autoTp: TpKey;
  trailOn: boolean;
  ha: boolean;
  flattenAtClose: boolean;
  lastFlatDate: string;
  skin: Skin;
  setSymbol: (id: string) => void;
  setTf: (tf: number) => void;
  setRisk: (r: string) => void;
  toggleArmed: () => void;
  toggleSendTl: () => void;
  toggleTrail: () => void;
  toggleHa: () => void;
  toggleFlattenAtClose: () => void;
  toggleSkin: () => void;
  setAutoTp: (v: TpKey) => void;
  scanAll: () => Promise<void>;
  tickSim: () => void;
  paper: (side: "BUY" | "SELL") => void;
  flatten: (reason?: string) => void;
  closePosition: (id: string, at: "mkt" | TpKey) => void;
};

const vault = loadVault();

export const useDesk = create<DeskState>((set, get) => ({
  symbol: vault.symbol ?? "NAS100",
  tf: vault.tf ?? 5,
  risk: vault.risk ?? "1",
  candles: {},
  analysis: {},
  backtests: {},
  live: false,
  scanning: false,
  feedLabel: "FEED",
  positions: vault.positions ?? [],
  closed: vault.closed ?? [],
  armed: vault.armed ?? false,
  sendTl: vault.sendTl ?? false,
  autoTp: vault.autoTp ?? "tp6",
  trailOn: vault.trailOn ?? true,
  ha: vault.ha ?? true,
  flattenAtClose: vault.flattenAtClose ?? true,
  lastFlatDate: vault.lastFlatDate ?? "",
  skin: vault.skin === "gamer" ? "gamer" : "command",
  setSymbol: (id) => set({ symbol: id }),
  setTf: (tf) => {
    set({ tf });
    void get().scanAll();
  },
  setRisk: (r) => set({ risk: r }),
  toggleArmed: () => set({ armed: !get().armed }),
  toggleSendTl: () => set({ sendTl: !get().sendTl }),
  toggleTrail: () => set({ trailOn: !get().trailOn }),
  toggleHa: () => set({ ha: !get().ha }),
  toggleFlattenAtClose: () => set({ flattenAtClose: !get().flattenAtClose }),
  toggleSkin: () => set({ skin: get().skin === "gamer" ? "command" : "gamer" }),
  setAutoTp: (v) => set({ autoTp: v }),
  scanAll: async () => {
    set({ scanning: true, feedLabel: "SCANNING" });
    const tf = get().tf;
    const results = await Promise.all(
      UNIVERSE.map(async (m) => {
        const { candles: bars, live } = await fetchOhlc({ data: { id: m.id, tf } });
        return {
          id: m.id,
          bars,
          live,
          analysis: analyzeMarket(bars),
          backtest: walkForward(synthesize(m, tf, 400)),
        };
      }),
    );
    const candles: Record<string, Candle[]> = {};
    const analysis: Record<string, Analysis> = {};
    const backtests: Record<string, BacktestStats> = {};
    let anyLive = false;
    for (const r of results) {
      candles[r.id] = r.bars;
      analysis[r.id] = r.analysis;
      backtests[r.id] = r.backtest;
      if (r.live) anyLive = true;
    }
    set({
      candles,
      analysis,
      backtests,
      scanning: false,
      live: anyLive,
      feedLabel: anyLive ? "LIVE FEED" : "SIM FEED",
    });
  },
  tickSim: () => {
    const { symbol, live, candles, positions, autoTp, trailOn, flattenAtClose, lastFlatDate } = get();
    const sess = nySession();
    if (flattenAtClose && sess.afterClose && lastFlatDate !== sess.date && positions.length) {
      get().flatten("NY CLOSE");
      set({ lastFlatDate: sess.date });
      return;
    }
    const c = candles[symbol];
    if (!c?.length) return;
    if (!live) {
      const last = c[c.length - 1];
      const n = last.c * (1 + (Math.random() - 0.5) * 0.0008);
      last.h = Math.max(last.h, n);
      last.l = Math.min(last.l, n);
      last.c = n;
    }
    const still: Position[] = [];
    const newly: ClosedTrade[] = [];
    const autoIdx = tpIndex(autoTp);
    for (const p of positions) {
      const bar = get().candles[p.sym]?.at(-1);
      const price = bar?.c ?? p.entry;
      const fav = p.side === "BUY" ? (bar?.h ?? price) : (bar?.l ?? price);
      const against = p.side === "BUY" ? (bar?.l ?? price) : (bar?.h ?? price);
      let sl = p.sl;
      let trailLabel = p.trailLabel;
      let hitTp = p.hitTp;
      if (trailOn) {
        const t = trailStop(p.side, p.entry, p.initSl, p.tps, fav);
        sl = p.side === "BUY" ? Math.max(p.sl, t.sl) : Math.min(p.sl, t.sl);
        trailLabel = t.label;
        hitTp = Math.max(p.hitTp, t.hit);
      }
      const nextP = { ...p, sl, trailLabel, hitTp };
      if (p.side === "BUY" && against <= sl) {
        newly.push(closeTrade(nextP, sl, trailLabel === "INIT" ? "SL" : `TRAIL ${trailLabel}`));
        continue;
      }
      if (p.side === "SELL" && against >= sl) {
        newly.push(closeTrade(nextP, sl, trailLabel === "INIT" ? "SL" : `TRAIL ${trailLabel}`));
        continue;
      }
      const tgt = autoIdx != null ? p.tps[autoIdx] : null;
      if (tgt != null) {
        if (p.side === "BUY" && price >= tgt) {
          newly.push(closeTrade(nextP, tgt, autoTp.toUpperCase()));
          continue;
        }
        if (p.side === "SELL" && price <= tgt) {
          newly.push(closeTrade(nextP, tgt, autoTp.toUpperCase()));
          continue;
        }
      }
      still.push(nextP);
    }
    const next = { ...candles, [symbol]: c };
    const analysis = { ...get().analysis, [symbol]: analyzeMarket(c) };
    set({
      candles: next,
      analysis,
      positions: still,
      closed: newly.length ? [...get().closed, ...newly] : get().closed,
    });
    const a = analysis[symbol];
    if (get().armed && a.executable && a.setup && a.setup.signal !== "WAIT") {
      const withTrend =
        (a.setup.signal === "BUY" && a.bias === "bull") ||
        (a.setup.signal === "SELL" && a.bias === "bear");
      if (withTrend) get().paper(a.setup.signal);
    }
  },
  paper: (side: Signal) => {
    if (side !== "BUY" && side !== "SELL") return;
    const { symbol, analysis, candles, risk, positions, sendTl } = get();
    const a = analysis[symbol];
    if (!a?.executable) return;
    const meta = marketById(symbol);
    const s = a.setup;
    const last = candles[symbol]?.at(-1);
    if (!last) return;
    const entry = s && s.signal === side ? s.entry : last.c;
    const sl = s && s.signal === side ? s.sl : side === "BUY" ? entry * 0.995 : entry * 1.005;
    const tps = s?.tps?.length === 6 ? s.tps : rTargets(entry, sl, side);
    const riskAmt = START_EQ * (Number(risk) / 100);
    const tl = useTl.getState();
    const session = tl.session;
    const copies = session
      ? session.accounts.filter((acc) => session.copyIds.includes(acc.accNum))
      : [];
    const targets =
      copies.length > 0
        ? copies.map((acc) => ({ key: acc.accNum, label: acc.id }))
        : [{ key: "PAPER", label: "PAPER" }];
    const fresh: Position[] = [];
    for (const t of targets) {
      if (positions.some((p) => p.sym === symbol && p.account === t.key)) continue;
      fresh.push({
        id: `${Date.now()}-${t.key}-${positions.length + fresh.length}`,
        sym: meta.id,
        side,
        entry,
        sl,
        initSl: sl,
        tp1: tps[0],
        tp2: tps[1],
        tps,
        riskPct: Number(risk),
        riskAmt,
        openedAt: new Date().toISOString(),
        trailLabel: "INIT",
        hitTp: -1,
        account: t.key,
      });
    }
    if (!fresh.length) return;
    set({ positions: [...positions, ...fresh] });
    if (sendTl && session && copies.length) {
      const qty = Math.max(0.01, Math.round(Number(risk) * 100) / 10000);
      void Promise.all(
        copies.map(async (acc) => {
          try {
            await tlPlace({
              data: {
                env: session.env,
                token: session.accessToken,
                accountId: acc.id,
                accNum: acc.accNum,
                symbol: meta.id,
                side,
                sl,
                tp: tps[5] ?? tps[1],
                qty,
              },
            });
            return { acc: acc.id, ok: true, msg: "copied" };
          } catch (e) {
            return { acc: acc.id, ok: false, msg: e instanceof Error ? e.message : "copy failed" };
          }
        }),
      ).then((rows) => useTl.getState().setLastCopy(rows));
    }
  },
  flatten: (reason = "FLATTEN") => {
    const { positions, candles, closed } = get();
    const done = positions.map((p) => {
      const px = candles[p.sym]?.at(-1)?.c ?? p.entry;
      return closeTrade(p, px, reason);
    });
    set({ positions: [], closed: [...closed, ...done] });
  },
  closePosition: (id, at) => {
    const { positions, closed } = get();
    const p = positions.find((x) => x.id === id);
    if (!p) return;
    const idx = tpIndex(at);
    const px = idx != null ? p.tps[idx] : (get().candles[p.sym]?.at(-1)?.c ?? p.entry);
    set({
      positions: positions.filter((x) => x.id !== id),
      closed: [...closed, closeTrade(p, px, at.toUpperCase())],
    });
  },
}));

if (typeof window !== "undefined") {
  useDesk.subscribe((s) => saveVault(s));
}

function closeTrade(p: Position, exit: number, reason: string): ClosedTrade {
  const { r, pnl } = mark(p, exit);
  return {
    id: p.id,
    sym: p.sym,
    side: p.side,
    entry: String(p.entry),
    r: r.toFixed(2) + "R",
    t: new Date().toISOString(),
    exit,
    pnl,
    rMult: r,
    reason,
  };
}
