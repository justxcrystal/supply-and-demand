import { create } from "zustand";
import { tlLogin, type TlAccount, type TlEnv } from "./tradelocker";

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
  setOpen: (v: boolean) => void;
  hydrate: () => void;
  login: (p: { email: string; password: string; server: string; env: TlEnv }) => Promise<void>;
  pickAccount: (accNum: string) => void;
  toggleCopy: (accNum: string) => void;
  setCopyAll: (on: boolean) => void;
  setLastCopy: (rows: CopyResult[]) => void;
  logout: () => void;
};

function persist(s: Session | null) {
  if (typeof sessionStorage === "undefined") return;
  if (!s) sessionStorage.removeItem(KEY);
  else sessionStorage.setItem(KEY, JSON.stringify(s));
}

export const useTl = create<TlState>((set, get) => ({
  open: false,
  busy: false,
  error: "",
  session: null,
  lastCopy: [],
  setOpen: (v) => set({ open: v, error: "" }),
  hydrate: () => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Session;
      if (s?.accessToken) {
        if (!s.copyIds?.length) s.copyIds = s.accounts.map((a) => a.accNum);
        set({ session: s });
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
      set({ session, busy: false, open: false });
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Login failed",
      });
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
  logout: () => {
    persist(null);
    set({ session: null, error: "", lastCopy: [] });
  },
}));
