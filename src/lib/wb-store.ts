import { create } from "zustand";
import { normalizeWbEnv, wbEquity, wbFlatten, wbLogin, wbOpenTrades, wbRefresh, type WbAccount, type WbEnv, type WbOpenTrade } from "./webull";

const KEY = "sd.webull.session";

type Session = {
  token: string;
  expiresAt: string;
  env: WbEnv;
  appKey: string;
  appSecret: string;
  accounts: WbAccount[];
  accountId: string;
};

export type WbCopyResult = { acc: string; ok: boolean; msg: string };

type WbState = {
  open: boolean;
  busy: boolean;
  error: string;
  session: Session | null;
  lastCopy: WbCopyResult[];
  openTrades: WbOpenTrade[];
  setOpen: (v: boolean) => void;
  hydrate: () => void;
  login: (p: { appKey: string; appSecret: string; env: WbEnv }) => Promise<void>;
  refresh: () => Promise<void>;
  refreshTrades: () => Promise<void>;
  pickAccount: (id: string) => void;
  setLastCopy: (rows: WbCopyResult[]) => void;
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

export const useWb = create<WbState>((set, get) => ({
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
      if (s?.token && s.appKey && s.appSecret) {
        s.env = normalizeWbEnv(s.env);
        if (!s.accountId) s.accountId = s.accounts[0]?.id ?? "";
        set({ session: s });
        void get().refresh();
        void get().refreshTrades();
      }
    } catch {
      /* ignore */
    }
  },
  login: async (p) => {
    set({ busy: true, error: "" });
    try {
      const r = await wbLogin({ data: p });
      const session: Session = {
        ...r,
        accountId: r.accounts.find((a) => /future/i.test(a.label + a.type))?.id ?? r.accounts[0]?.id ?? "",
      };
      persist(session);
      set({ session, busy: false, open: false });
      void get().refreshTrades();
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : "Login failed" });
    }
  },
  refresh: async () => {
    const session = get().session;
    if (!session || moneyLock) return;
    moneyLock = true;
    try {
      const accounts = await wbRefresh({
        data: {
          env: session.env,
          appKey: session.appKey,
          appSecret: session.appSecret,
          token: session.token,
          accounts: session.accounts,
        },
      });
      const cur = get().session;
      if (!cur || cur.token !== session.token) return;
      const accountId = accounts.some((a) => a.id === cur.accountId) ? cur.accountId : accounts[0]?.id ?? "";
      const next = { ...cur, accounts, accountId };
      persist(next);
      set({ session: next });
    } catch {
      /* keep last */
    } finally {
      moneyLock = false;
    }
  },
  refreshTrades: async () => {
    const session = get().session;
    if (!session || tradeLock) return;
    tradeLock = true;
    try {
      const openTrades = await wbOpenTrades({
        data: {
          env: session.env,
          appKey: session.appKey,
          appSecret: session.appSecret,
          token: session.token,
          accounts: session.accounts,
        },
      });
      const cur = get().session;
      if (!cur || cur.token !== session.token) return;
      set({ openTrades });
    } catch {
      /* keep last */
    } finally {
      tradeLock = false;
    }
  },
  pickAccount: (id) => {
    const session = get().session;
    if (!session) return;
    const next = { ...session, accountId: id };
    persist(next);
    set({ session: next });
  },
  setLastCopy: (rows) => set({ lastCopy: rows }),
  flattenBroker: async () => {
    const session = get().session;
    if (!session) return;
    try {
      const rows = await wbFlatten({
        data: {
          env: session.env,
          appKey: session.appKey,
          appSecret: session.appSecret,
          token: session.token,
          accounts: session.accounts,
        },
      });
      set({ lastCopy: rows });
    } catch (e) {
      set({ lastCopy: [{ acc: "Webull", ok: false, msg: e instanceof Error ? e.message : "flatten failed" }] });
    }
    void get().refreshTrades();
    void get().refresh();
  },
  logout: () => {
    persist(null);
    set({ session: null, error: "", lastCopy: [], openTrades: [] });
  },
}));

export function wbLead(session: Session | null) {
  if (!session) return undefined;
  return session.accounts.find((a) => a.id === session.accountId) ?? session.accounts[0];
}

export function wbSessionEquity(session: Session | null) {
  return wbEquity(wbLead(session));
}