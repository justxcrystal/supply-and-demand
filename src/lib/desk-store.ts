import { create } from "zustand";
import { analyzeMarket } from "./strat/analyze";
import { walkForward } from "./strat/backtest";
import { synthesize } from "./strat/feed";
import { fetchOhlc } from "./strat/ohlc";
import { rTargets, tpIndex, trailStop } from "./strat/targets";
import { isTlAuthError, tlFailMsg, tlPlace } from "./tradelocker";
import { useTl } from "./tl-store";
import { wbPlace } from "./webull";
import { useWb } from "./wb-store";
import { marketById, marketsFor, UNIVERSE } from "./strat/universe";
import type { Analysis, BacktestStats, Book, Candle, ClosedTrade, Position, Signal, TpKey } from "./strat/types";

export const DESK_EQ = 25000;
export const CHALLENGE_EQ = 100;
export const CRYPTO_UNLOCK = 200;
export const START_EQ = DESK_EQ;
const VAULT = "sd.desk.vault.v1";
const pendingOrders = new Set<string>();
const autoSignals = new Set<string>();

type Skin = "command" | "gamer";

type Persisted = {
  symbol?: string;
  tf?: number;
  risk?: string;
  riskDefault?: number;
  positions?: Position[];
  closed?: ClosedTrade[];
  deskPositions?: Position[];
  deskClosed?: ClosedTrade[];
  challengePositions?: Position[];
  challengeClosed?: ClosedTrade[];
  challenge?: boolean;
  armed?: boolean;
  sendTl?: boolean;
  autoTp?: TpKey;
  trailOn?: boolean;
  ha?: boolean;
  flattenAtClose?: boolean;
  lastFlatDate?: string;
  skin?: Skin;
  book?: Book;
  sendWb?: boolean;
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
    riskDefault: 3,
    positions: s.positions,
    closed: s.closed.slice(-200),
    deskPositions: s.deskPositions,
    deskClosed: s.deskClosed.slice(-200),
    challengePositions: s.challengePositions,
    challengeClosed: s.challengeClosed.slice(-200),
    challenge: s.challenge,
    armed: s.armed,
    sendTl: s.sendTl,
    autoTp: s.autoTp,
    trailOn: s.trailOn,
    ha: s.ha,
    flattenAtClose: s.flattenAtClose,
    lastFlatDate: s.lastFlatDate,
    skin: s.skin,
    book: s.book,
    sendWb: s.sendWb,
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

export function startEq(challenge: boolean) {
  return challenge ? CHALLENGE_EQ : DESK_EQ;
}

export function bookEquity(args: {
  challenge: boolean;
  positions: Position[];
  closed: ClosedTrade[];
  candles: Record<string, Candle[]>;
}) {
  const openPnl = args.positions.reduce((s, p) => {
    const px = args.candles[p.sym]?.at(-1)?.c ?? p.entry;
    return s + mark(p, px).pnl;
  }, 0);
  const closedPnl = args.closed.reduce((s, t) => s + t.pnl, 0);
  return startEq(args.challenge) + closedPnl + openPnl;
}

export function cryptoLocked(challenge: boolean, equity: number) {
  return challenge && equity < CRYPTO_UNLOCK;
}

export function marketAllowed(id: string, challenge: boolean, equity: number) {
  if (!cryptoLocked(challenge, equity)) return true;
  try {
    return marketById(id).kind === "crypto";
  } catch {
    return false;
  }
}

type DeskState = {
  symbol: string;
  tf: number;
  risk: string;
  candles: Record<string, Candle[]>;
  analysis: Record<string, Analysis>;
  backtests: Record<string, BacktestStats>;
  live: boolean;
  liveBySymbol: Record<string, boolean>;
  scanning: boolean;
  feedLabel: string;
  positions: Position[];
  closed: ClosedTrade[];
  deskPositions: Position[];
  deskClosed: ClosedTrade[];
  challengePositions: Position[];
  challengeClosed: ClosedTrade[];
  challenge: boolean;
  armed: boolean;
  sendTl: boolean;
  autoTp: TpKey;
  trailOn: boolean;
  ha: boolean;
  flattenAtClose: boolean;
  lastFlatDate: string;
  skin: Skin;
  book: Book;
  sendWb: boolean;
  setSymbol: (id: string) => void;
  setTf: (tf: number) => void;
  setRisk: (r: string) => void;
  setBook: (book: Book) => void;
  toggleArmed: () => void;
  toggleSendTl: () => void;
  toggleSendWb: () => void;
  toggleTrail: () => void;
  toggleHa: () => void;
  toggleFlattenAtClose: () => void;
  toggleSkin: () => void;
  toggleChallenge: () => void;
  resetChallenge: () => void;
  setAutoTp: (v: TpKey) => void;
  scanAll: () => Promise<void>;
  hunt: () => Promise<void>;
  refreshLead: () => Promise<void>;
  tickSim: () => void;
  paper: (side: "BUY" | "SELL") => void;
  manual: (p: { side: "BUY" | "SELL"; entry: number; sl: number; qty?: number }) => void;
  flatten: (reason?: string) => void;
  closePosition: (id: string, at: "mkt" | TpKey) => void;
};

const vault = loadVault();
const challengeOn = vault.challenge ?? false;
const deskPositions = vault.deskPositions ?? (vault.challenge === true ? [] : (vault.positions ?? []));
const deskClosed = vault.deskClosed ?? (vault.challenge === true ? [] : (vault.closed ?? []));
const challengePositions = vault.challengePositions ?? (vault.challenge === true ? vault.positions ?? [] : []);
const challengeClosed = vault.challengeClosed ?? (vault.challenge === true ? vault.closed ?? [] : []);

function pickSymbol(book: Book, challenge: boolean, equity: number, current?: string) {
  const list = marketsFor(book);
  if (current && list.some((m) => m.id === current) && marketAllowed(current, challenge, equity)) return current;
  const open = list.find((m) => marketAllowed(m.id, challenge, equity));
  return open?.id ?? list[0]?.id ?? (book === "futures" ? "MNQ" : "BTCUSD");
}

function setupScore(id: string, a: Analysis | undefined, book: Book, challenge: boolean, eq: number) {
  if (!a) return -1;
  try {
    if (marketById(id).book !== book) return -1;
  } catch {
    return -1;
  }
  const withTrend =
    (a.signal === "BUY" && a.bias === "bull") || (a.signal === "SELL" && a.bias === "bear");
  let s = a.setup?.score ?? a.zones[0]?.score ?? 0;
  if (a.executable && a.signal !== "WAIT") {
    s += 10000;
    if (withTrend) s += 2000;
    if (marketAllowed(id, challenge, eq)) s += 3000;
    return s;
  }
  if (marketAllowed(id, challenge, eq)) s += 50;
  if (a.amd?.phase === "distribution") s += 300;
  if (a.amd?.mss) s += 200;
  if ((a.setup?.touches ?? 99) < 3) s += 80;
  s -= (a.issues ?? []).filter((i) => i.level === "block").length * 40;
  return s;
}

function bestSetup(
  analysis: Record<string, Analysis>,
  book: Book,
  challenge: boolean,
  eq: number,
  readyOnly = false,
) {
  let best: { id: string; score: number } | null = null;
  for (const id of Object.keys(analysis)) {
    const a = analysis[id];
    if (readyOnly && !(a?.executable && a.signal !== "WAIT")) continue;
    const score = setupScore(id, a, book, challenge, eq);
    if (score < 0) continue;
    if (!best || score > best.score) best = { id, score };
  }
  return best;
}

export const useDesk = create<DeskState>((set, get) => ({
  symbol: pickSymbol(vault.book === "futures" ? "futures" : "forex", challengeOn, CHALLENGE_EQ, vault.symbol),
  tf: vault.tf ?? 5,
  risk: vault.riskDefault === 3 ? (vault.risk ?? "3") : "3",
  candles: {},
  analysis: {},
  backtests: {},
  live: false,
  liveBySymbol: {},
  scanning: false,
  feedLabel: "FEED",
  positions: challengeOn ? challengePositions : deskPositions,
  closed: challengeOn ? challengeClosed : deskClosed,
  deskPositions,
  deskClosed,
  challengePositions,
  challengeClosed,
  challenge: challengeOn,
  armed: vault.armed ?? false,
  sendTl: vault.sendTl ?? false,
  sendWb: vault.sendWb ?? false,
  autoTp: vault.autoTp ?? "tp6",
  trailOn: vault.trailOn ?? true,
  ha: vault.ha ?? true,
  flattenAtClose: vault.flattenAtClose ?? true,
  lastFlatDate: vault.lastFlatDate ?? "",
  skin: vault.skin === "gamer" ? "gamer" : "command",
  book: vault.book === "futures" ? "futures" : "forex",
  setSymbol: (id) => set({ symbol: id, live: get().liveBySymbol[id] ?? false, feedLabel: get().liveBySymbol[id] ? "LIVE FEED" : "SIM FEED" }),
  setTf: (tf) => {
    set({ tf });
    void get().scanAll();
  },
  setRisk: (r) => set({ risk: r }),
  setBook: (book) => {
    const s = get();
    const eq = bookEquity({
      challenge: s.challenge,
      positions: s.positions,
      closed: s.closed,
      candles: s.candles,
    });
    const symbol = pickSymbol(book, s.challenge, eq, s.symbol);
    set({ book, symbol, live: s.liveBySymbol[symbol] ?? false, feedLabel: s.liveBySymbol[symbol] ? "LIVE FEED" : "SIM FEED" });
  },
  toggleArmed: () => set({ armed: !get().armed }),
  toggleSendTl: () => set({ sendTl: !get().sendTl }),
  toggleSendWb: () => set({ sendWb: !get().sendWb }),
  toggleTrail: () => set({ trailOn: !get().trailOn }),
  toggleHa: () => set({ ha: !get().ha }),
  toggleFlattenAtClose: () => set({ flattenAtClose: !get().flattenAtClose }),
  toggleSkin: () => set({ skin: get().skin === "gamer" ? "command" : "gamer" }),
  toggleChallenge: () => {
    const s = get();
    if (s.challenge) {
      set({
        challenge: false,
        challengePositions: s.positions,
        challengeClosed: s.closed,
        positions: s.deskPositions,
        closed: s.deskClosed,
      });
      return;
    }
    const eq = bookEquity({
      challenge: true,
      positions: s.challengePositions,
      closed: s.challengeClosed,
      candles: s.candles,
    });
    let book: Book = s.book;
    if (cryptoLocked(true, eq) && book === "futures") book = "forex";
    const symbol = pickSymbol(book, true, eq, s.symbol);
    set({
      challenge: true,
      deskPositions: s.positions,
      deskClosed: s.closed,
      positions: s.challengePositions,
      closed: s.challengeClosed,
      book,
      symbol,
    });
  },
  resetChallenge: () => {
    const s = get();
    if (!s.challenge) return;
    set({
      positions: [],
      closed: [],
      challengePositions: [],
      challengeClosed: [],
      lastFlatDate: "",
      symbol: "BTCUSD",
    });
  },
  setAutoTp: (v) => set({ autoTp: v }),
  scanAll: async () => {
    const tf = get().tf;
    const leadId = get().symbol;
    const had = (get().candles[leadId]?.length ?? 0) > 8;
    if (!had) set({ scanning: true, feedLabel: "SCANNING" });
    const loadOne = async (id: string) => {
      const m = marketById(id);
      try {
        const { candles: bars, live } = await fetchOhlc({ data: { id, tf } });
        const tape = bars.length ? bars : synthesize(m, tf);
        return {
          id,
          bars: tape,
          live: live && bars.length > 40,
          analysis: analyzeMarket(tape),
          backtest: walkForward(synthesize(m, tf, 400)),
        };
      } catch {
        const tape = synthesize(m, tf);
        return {
          id,
          bars: tape,
          live: false,
          analysis: analyzeMarket(tape),
          backtest: walkForward(tape),
        };
      }
    };
    try {
      const first = await loadOne(leadId);
      set({
        candles: { ...get().candles, [first.id]: first.bars },
        analysis: { ...get().analysis, [first.id]: first.analysis },
        backtests: { ...get().backtests, [first.id]: first.backtest },
        liveBySymbol: { ...get().liveBySymbol, [first.id]: first.live },
        scanning: false,
        live: first.live,
        feedLabel: first.live ? "LIVE FEED" : "SIM FEED",
      });
      const rest = UNIVERSE.filter((m) => m.id !== leadId);
      const results = await Promise.all(rest.map((m) => loadOne(m.id)));
      const candles: Record<string, Candle[]> = { ...get().candles, [first.id]: first.bars };
      const analysis: Record<string, Analysis> = { ...get().analysis, [first.id]: first.analysis };
      const backtests: Record<string, BacktestStats> = { ...get().backtests, [first.id]: first.backtest };
      const liveBySymbol = { ...get().liveBySymbol, [first.id]: first.live };
      for (const r of results) {
        candles[r.id] = r.bars;
        analysis[r.id] = r.analysis;
        backtests[r.id] = r.backtest;
        liveBySymbol[r.id] = r.live;
      }
      set({
        candles,
        analysis,
        backtests,
        liveBySymbol,
        scanning: false,
        live: liveBySymbol[get().symbol] ?? false,
        feedLabel: liveBySymbol[get().symbol] ? "LIVE FEED" : "SIM FEED",
      });
    } catch {
      set({ scanning: false, feedLabel: get().live ? "LIVE FEED" : "SIM FEED" });
    }
  },
  hunt: async () => {
    const s0 = get();
    const eq = bookEquity(s0);
    const allowed = marketsFor(s0.book);
    const tfs = [s0.tf, ...[15, 5, 1, 30, 60].filter((t) => t !== s0.tf)];
    set({ scanning: true, feedLabel: "SCANNING" });
    const load = async (id: string, tf: number) => {
      const m = marketById(id);
      try {
        const { candles: bars, live } = await fetchOhlc({ data: { id, tf } });
        const tape = bars.length ? bars : synthesize(m, tf);
        return { id, bars: tape, live: live && bars.length > 40, analysis: analyzeMarket(tape) };
      } catch {
        const tape = synthesize(m, tf);
        return { id, bars: tape, live: false, analysis: analyzeMarket(tape) };
      }
    };
    try {
      type Hit = { id: string; tf: number; bars: Candle[]; analysis: Analysis; live: boolean; score: number };
      let winner: Hit | null = null;
      let closest: Hit | null = null;
      let board: { id: string; bars: Candle[]; analysis: Analysis; live: boolean }[] = [];
      for (const tf of tfs) {
        const rows = await Promise.all(allowed.map((m) => load(m.id, tf)));
        if (tf === s0.tf) board = rows;
        const pack: Record<string, Analysis> = {};
        for (const r of rows) {
          pack[r.id] = r.analysis;
          const score = setupScore(r.id, r.analysis, s0.book, s0.challenge, eq);
          if (score > (closest?.score ?? -1)) closest = { ...r, tf, score };
        }
        const ready = bestSetup(pack, s0.book, s0.challenge, eq, true);
        if (ready) {
          const hit = rows.find((r) => r.id === ready.id);
          if (hit) {
            winner = { ...hit, tf, score: ready.score };
            break;
          }
        }
      }
      const pick = winner ?? closest;
      const candles = { ...get().candles };
      const analysis = { ...get().analysis };
      for (const r of board) {
        candles[r.id] = r.bars;
        analysis[r.id] = r.analysis;
      }
      const liveBySymbol = { ...get().liveBySymbol };
      for (const r of board) liveBySymbol[r.id] = r.live;
      if (pick) {
        candles[pick.id] = pick.bars;
        analysis[pick.id] = pick.analysis;
        liveBySymbol[pick.id] = pick.live;
        set({
          symbol: pick.id,
          tf: pick.tf,
          candles,
          analysis,
          liveBySymbol,
          scanning: false,
          live: pick.live,
          feedLabel: pick.live ? "LIVE FEED" : "SIM FEED",
        });
        return;
      }
      set({
        candles,
        analysis,
        liveBySymbol,
        scanning: false,
        live: liveBySymbol[get().symbol] ?? false,
        feedLabel: liveBySymbol[get().symbol] ? "LIVE FEED" : "SIM FEED",
      });
    } catch {
      set({ scanning: false, feedLabel: get().live ? "LIVE FEED" : "SIM FEED" });
    }
  },
  refreshLead: async () => {
    const { symbol, tf, candles, analysis } = get();
    try {
      const r = await fetchOhlc({ data: { id: symbol, tf } });
      if (!r.candles.length) return;
      set({
        candles: { ...candles, [symbol]: r.candles },
        analysis: { ...analysis, [symbol]: analyzeMarket(r.candles) },
        liveBySymbol: { ...get().liveBySymbol, [symbol]: r.live },
        live: r.live,
        feedLabel: r.live ? "LIVE FEED" : "SIM FEED",
        scanning: false,
      });
    } catch {
      /* keep last bars */
    }
  },
  tickSim: () => {
    const { symbol, live, candles, positions, autoTp, trailOn, flattenAtClose, lastFlatDate, challenge } = get();
    const sess = nySession();
    if (flattenAtClose && sess.afterClose && lastFlatDate !== sess.date) {
      if (positions.length) get().flatten("NY CLOSE");
      void useTl.getState().flattenBroker({ prompt: false });
      void useWb.getState().flattenBroker();
      set({ lastFlatDate: sess.date });
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
    const nextClosed = newly.length ? [...get().closed, ...newly] : get().closed;
    set({
      candles: next,
      analysis,
      positions: still,
      closed: nextClosed,
      ...(challenge
        ? { challengePositions: still, challengeClosed: nextClosed }
        : { deskPositions: still, deskClosed: nextClosed }),
    });
    const a = analysis[symbol];
    const eq = bookEquity({ challenge, positions: still, closed: nextClosed, candles: next });
    if (live && get().armed && a.executable && a.setup && a.setup.signal !== "WAIT" && marketAllowed(symbol, challenge, eq)) {
      const withTrend =
        (a.setup.signal === "BUY" && a.bias === "bull") ||
        (a.setup.signal === "SELL" && a.bias === "bear");
      const key = `${symbol}:${get().tf}:${c.at(-1)?.t}:${a.setup.signal}`;
      if (withTrend && !autoSignals.has(key)) {
        autoSignals.add(key);
        if (autoSignals.size > 100) autoSignals.delete(autoSignals.values().next().value!);
        get().paper(a.setup.signal);
      }
    }
  },
  paper: (side: Signal) => {
    if (side !== "BUY" && side !== "SELL") return;
    const { symbol, analysis, candles } = get();
    const a = analysis[symbol];
    if (!a?.executable) return;
    const s = a.setup;
    const last = candles[symbol]?.at(-1);
    if (!last) return;
    const entry = s && s.signal === side ? s.entry : last.c;
    const sl = s && s.signal === side ? s.sl : side === "BUY" ? entry * 0.995 : entry * 1.005;
    get().manual({ side, entry, sl });
  },
  manual: (p) => {
    if (p.side !== "BUY" && p.side !== "SELL") return;
    if (!Number.isFinite(p.entry) || !Number.isFinite(p.sl)) return;
    if (p.side === "BUY" && !(p.sl < p.entry)) return;
    if (p.side === "SELL" && !(p.sl > p.entry)) return;
    const { symbol, candles, risk, positions, sendTl, sendWb, challenge, closed, book } = get();
    const eq = bookEquity({ challenge, positions, closed, candles });
    if (!marketAllowed(symbol, challenge, eq)) return;
    const last = candles[symbol]?.at(-1);
    if (!last) return;
    const meta = marketById(symbol);
    const side = p.side;
    const entry = p.entry;
    const sl = p.sl;
    const tps = rTargets(entry, sl, side);
    const riskAmt = startEq(challenge) * (Number(risk) / 100);
    const tl = useTl.getState();
    const session = tl.session;
    const copies = session ? session.accounts.filter((acc) => session.copyIds.includes(acc.accNum)) : [];
    const wb = useWb.getState().session;
    const wbLead = wb ? (wb.accounts.find((a) => a.id === wb.accountId) ?? wb.accounts[0]) : undefined;
    if (book === "forex" && sendTl) {
      if (!copies.length) {
        tl.setLastCopy([{ acc: "TradeLocker", ok: false, msg: "Log in and select at least one copy account" }]);
        return;
      }
      if (!tl.tradesReady) {
        tl.setLastCopy([{ acc: "TradeLocker", ok: false, msg: tl.tradesError || "Checking open trades; try again shortly" }]);
        void tl.refreshTrades();
        return;
      }
      const qty = p.qty ?? Math.max(0.01, Math.round(Number(risk) * 100) / 10000);
      if (!Number.isFinite(qty) || qty <= 0) {
        tl.setLastCopy([{ acc: "TradeLocker", ok: false, msg: "Enter a valid lot size" }]);
        return;
      }
      const open = tl.openTrades.find((trade) => copies.some((acc) => acc.accNum === trade.accNum));
      if (open) {
        tl.setLastCopy([{ acc: open.accountId, ok: false, msg: `Close the existing ${open.symbol} trade before sending another` }]);
        return;
      }
      const available = copies.filter((acc) => !pendingOrders.has(`tl:${acc.accNum}`));
      if (available.length !== copies.length) {
        tl.setLastCopy([{ acc: "TradeLocker", ok: false, msg: "An order is already being submitted" }]);
        return;
      }
      available.forEach((acc) => pendingOrders.add(`tl:${acc.accNum}`));
      tl.setLastCopy(available.map((acc) => ({ acc: acc.id, ok: false, msg: "Submitting…" })));
      void (async () => {
        try {
          const fresh = await useTl.getState().ensureToken();
          if (!fresh) {
            tl.setLastCopy([{ acc: "TradeLocker", ok: false, msg: "Session expired — log in again" }]);
            return;
          }
          const rows = await Promise.all(available.map(async (acc) => {
            const order = { accountId: acc.id, accNum: acc.accNum, symbol: meta.id, side, sl, tp: tps[5] ?? tps[1], qty };
            try {
              await tlPlace({ data: { ...order, env: fresh.env, token: fresh.accessToken } });
              return { acc: acc.id, ok: true, msg: "Order accepted; check open trades for fill" };
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Order failed";
              if (!isTlAuthError(msg)) return { acc: acc.id, ok: false, msg: tlFailMsg(msg) };
              const retry = await useTl.getState().ensureToken(true);
              if (!retry) return { acc: acc.id, ok: false, msg: "Session expired — log in again" };
              try {
                await tlPlace({ data: { ...order, env: retry.env, token: retry.accessToken } });
                return { acc: acc.id, ok: true, msg: "Order accepted; check open trades for fill" };
              } catch (e2) {
                return { acc: acc.id, ok: false, msg: tlFailMsg(e2 instanceof Error ? e2.message : "Order failed") };
              }
            }
          }));
          tl.setLastCopy(rows);
          void tl.refreshTrades();
        } finally {
          available.forEach((acc) => pendingOrders.delete(`tl:${acc.accNum}`));
        }
      })();
      return;
    }
    if (book === "futures" && sendWb) {
      if (!wb || !wbLead || !meta.wb) {
        useWb.getState().setLastCopy([{ acc: "Webull", ok: false, msg: "Connect a futures account for this symbol" }]);
        return;
      }
      const key = `wb:${wbLead.id}`;
      if (pendingOrders.has(key)) return;
      pendingOrders.add(key);
      useWb.getState().setLastCopy([{ acc: wbLead.label, ok: false, msg: "Submitting…" }]);
      void wbPlace({ data: { env: wb.env, appKey: wb.appKey, appSecret: wb.appSecret, token: wb.token, accountId: wbLead.id, product: meta.wb, side, qty: Math.max(1, Math.round(p.qty ?? 1)) } })
        .then(() => useWb.getState().setLastCopy([{ acc: wbLead.label, ok: true, msg: `Order accepted for ${meta.wb}` }]))
        .catch((e) => useWb.getState().setLastCopy([{ acc: wbLead.label, ok: false, msg: e instanceof Error ? e.message : "Order failed" }]))
        .finally(() => pendingOrders.delete(key));
      return;
    }
    const targets =
      book === "forex" && copies.length > 0
        ? copies.map((acc) => ({ key: acc.accNum, label: acc.id }))
        : book === "futures" && wbLead
          ? [{ key: wbLead.id, label: wbLead.label }]
          : [{ key: "PAPER", label: "PAPER" }];
    const fresh: Position[] = [];
    for (const t of targets) {
      if (positions.some((pos) => pos.sym === symbol && pos.account === t.key)) continue;
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
    const nextPos = [...positions, ...fresh];
    set({
      positions: nextPos,
      ...(challenge ? { challengePositions: nextPos } : { deskPositions: nextPos }),
    });
  },
  flatten: (reason = "FLATTEN") => {
    const { positions, candles, closed, challenge } = get();
    const done = positions.map((p) => {
      const px = candles[p.sym]?.at(-1)?.c ?? p.entry;
      return closeTrade(p, px, reason);
    });
    const nextClosed = [...closed, ...done];
    set({
      positions: [],
      closed: nextClosed,
      ...(challenge
        ? { challengePositions: [], challengeClosed: nextClosed }
        : { deskPositions: [], deskClosed: nextClosed }),
    });
  },
  closePosition: (id, at) => {
    const { positions, closed, challenge } = get();
    const p = positions.find((x) => x.id === id);
    if (!p) return;
    const idx = tpIndex(at);
    const px = idx != null ? p.tps[idx] : (get().candles[p.sym]?.at(-1)?.c ?? p.entry);
    const nextPos = positions.filter((x) => x.id !== id);
    const nextClosed = [...closed, closeTrade(p, px, at.toUpperCase())];
    set({
      positions: nextPos,
      closed: nextClosed,
      ...(challenge
        ? { challengePositions: nextPos, challengeClosed: nextClosed }
        : { deskPositions: nextPos, deskClosed: nextClosed }),
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
