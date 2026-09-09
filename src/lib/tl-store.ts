import { create } from "zustand";
import { accountEquity, isTlAuthError, jwtLeftMs, leadAccount, normalizeEnv, tlFlatten, tlLogin, tlOpenTrades, tlRefreshJwt, tlRefreshMoney, type TlAccount, type TlEnv, type TlOpenTrade } from "./tradelocker";

const KEY = "sd.tradelocker.session";

type Session = {
  accessToken: string;
  refreshToken: string;
  expireDate: string;
  email: string;
  env: TlEnv;
  server: string;
  accounts: TlAccount[];
  accNum: string;
  copyIds: string[];
};

export type CopyResult = { acc: string; ok: boolean; msg: string };

type TlState = {
  open: boolean;
  busy: boolean;
  error: string;
  session: Session | null;
  lastCopy: CopyResult[];
  openTrades: TlOpenTrade[];
  setOpen: (v: boolean) => void;
  hydrate: () => void;
  login: (p: { email: string; password: string; server: string; env: TlEnv }) => Promise<void>;
  ensureToken: (force?: boolean) => Promise<Session | null>;
  refreshMoney: () => Promise<void>;
  refreshTrades: () => Promise<void>;
  pickAccount: (accNum: string) => void;
  toggleCopy: (accNum: string) => void;
  setCopyAll: (on: boolean) => void;
  setLastCopy: (rows: CopyResult[]) => void;
  flattenBroker: () => Promise<void>;
  logout: () => void;
};

function persist(s: Session | null) {
  if (typeof localStorage === "undefined") return;
  if (!s) {
    localStorage.removeItem(KEY);
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  } else localStorage.setItem(KEY, JSON.stringify(s));
}

let moneyLock = false;
let tradeLock = false;
let tokenLock: Promise<Session | null> | null = null;

export const useTl = create<TlState>((set, get) => ({
  open: false,
  busy: false,
  error: "",
  session: null,
  lastCopy: [],
  openTrades: [],
  setOpen: (v) => set({ open: v, error: "" }),
  hydrate: () => {
    try {
      const raw = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Session;
      if (s?.accessToken) {
        s.env = normalizeEnv(s.env);
        if (!s.copyIds?.length) s.copyIds = s.accounts.map((a) => a.accNum);
        set({ session: s });
        void get().refreshMoney();
        void get().refreshTrades();
      }
    } catch {
      /* ignore */
    }
  },
  login: async (p) => {
    set({ busy: true, error: "" });
    try {
      const r = await tlLogin({ data: p });
      const copyIds = r.accounts.map((a) => a.accNum);
      const session: Session = {
        ...r,
        accNum: r.accounts[0]?.accNum ?? "",
        copyIds,
      };
      persist(session);
      set({ session, busy: false, open: false, error: "", lastCopy: [] });
      void get().refreshTrades();
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Login failed",
      });
    }
  },
  ensureToken: async (force = false) => {
    const session = get().session;
    if (!session) return null;
    if (!force && jwtLeftMs(session.accessToken, session.expireDate) > 10 * 60 * 1000) return session;
    if (tokenLock) return tokenLock;
    tokenLock = (async () => {
      try {
        const r = await tlRefreshJwt({
          data: {
            env: session.env,
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
          },
        });
        const cur = get().session;
        if (!cur) return null;
        const next = { ...cur, ...r };
        persist(next);
        set({ session: next, error: "", lastCopy: [] });
        return next;
      } catch (e) {
        persist(null);
        set({
          session: null,
          openTrades: [],
          lastCopy: [{ acc: "TradeLocker", ok: false, msg: "session expired — log in again" }],
          open: true,
          error: e instanceof Error ? e.message : "TradeLocker session expired. Log in again.",
        });
        return null;
      } finally {
        tokenLock = null;
      }
    })();
    return tokenLock;
  },
  refreshMoney: async () => {
    const session = await get().ensureToken();
    if (!session || moneyLock) return;
    moneyLock = true;
    try {
      const accounts = await tlRefreshMoney({
        data: {
          env: session.env,
          token: session.accessToken,
          accounts: session.accounts,
        },
      });
      const cur = get().session;
      if (!cur) return;
      const next = { ...cur, accounts };
      persist(next);
      set({ session: next });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (isTlAuthError(msg)) {
        persist(null);
        set({
          session: null,
          open: true,
          error: "TradeLocker session expired. Log in again.",
          lastCopy: [{ acc: "TradeLocker", ok: false, msg: "session expired — log in again" }],
        });
      }
    } finally {
      moneyLock = false;
    }
  },
  refreshTrades: async () => {
    const session = await get().ensureToken();
    if (!session || tradeLock) return;
    tradeLock = true;
    try {
      const openTrades = await tlOpenTrades({
        data: {
          env: session.env,
          token: session.accessToken,
          accounts: session.accounts,
        },
      });
      if (!get().session) return;
      set({ openTrades });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (isTlAuthError(msg)) void get().ensureToken();
    } finally {
      tradeLock = false;
    }
  },
  pickAccount: (accNum) => {
    const session = get().session;
    if (!session) return;
    const copyIds = session.copyIds.includes(accNum) ? session.copyIds : [...session.copyIds, accNum];
    const next = { ...session, accNum, copyIds };
    persist(next);
    set({ session: next });
  },
  toggleCopy: (accNum) => {
    const session = get().session;
    if (!session) return;
    const has = session.copyIds.includes(accNum);
    let copyIds = has ? session.copyIds.filter((id) => id !== accNum) : [...session.copyIds, accNum];
    if (copyIds.length === 0) copyIds = [accNum];
    const lead = copyIds.includes(session.accNum) ? session.accNum : copyIds[0];
    const next = { ...session, copyIds, accNum: lead };
    persist(next);
    set({ session: next });
  },
  setCopyAll: (on) => {
    const session = get().session;
    if (!session) return;
    const copyIds = on ? session.accounts.map((a) => a.accNum) : [session.accNum];
    const next = { ...session, copyIds };
    persist(next);
    set({ session: next });
  },
  setLastCopy: (rows) => set({ lastCopy: rows }),
  flattenBroker: async () => {
    const session = await get().ensureToken();
    if (!session) {
      set({ open: true, error: get().error || "Log into TradeLocker to flatten." });
      return;
    }
    const copies = session.accounts.filter((a) => session.copyIds.includes(a.accNum));
    const accounts = copies.length ? copies : session.accounts.slice(0, 1);
    try {
      const rows = await tlFlatten({
        data: { env: session.env, token: session.accessToken, accounts },
      });
      set({ lastCopy: rows });
    } catch (e) {
      set({ lastCopy: [{ acc: "TradeLocker", ok: false, msg: e instanceof Error ? e.message : "flatten failed" }] });
    }
    void get().refreshTrades();
    void get().refreshMoney();
  },
  logout: () => {
    persist(null);
    set({ session: null, error: "", lastCopy: [], openTrades: [] });
  },
}));

export function sessionLead(session: Session | null) {
  if (!session) return undefined;
  return leadAccount(session.accounts, session.accNum);
}

export function sessionEquity(session: Session | null) {
  return accountEquity(sessionLead(session));
}
