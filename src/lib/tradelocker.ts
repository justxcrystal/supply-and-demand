import { createServerFn } from "@tanstack/react-start";

export type TlEnv = "broker" | "live";

export type TlAccount = {
  id: string;
  name: string;
  currency: string;
  status: string;
  accNum: string;
  balance?: number;
  equity?: number;
  available?: number;
  todayNet?: number;
  openPnl?: number;
};

export type TlOpenTrade = {
  id: string;
  accNum: string;
  accountId: string;
  accountName: string;
  currency: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  entry: number;
  pnl?: number;
  openDate?: number;
};

export type TlMoney = {
  accNum: string;
  id: string;
  balance?: number;
  equity?: number;
  available?: number;
  todayNet?: number;
  openPnl?: number;
  error?: string;
};

const BASE: Record<TlEnv, string> = {
  broker: "https://demo.tradelocker.com/backend-api",
  live: "https://live.tradelocker.com/backend-api",
};

export function normalizeEnv(v: unknown): TlEnv {
  return v === "live" ? "live" : "broker";
}

/** Official SDK order for /trade/accounts/{id}/state when /trade/config is missing. */
const DEFAULT_DETAIL_COLS = [
  "balance",
  "projectedBalance",
  "availableFunds",
  "blockedBalance",
  "cashBalance",
  "unsettledCash",
  "withdrawalAvailable",
  "stocksValue",
  "optionValue",
  "initialMarginReq",
  "maintMarginReq",
  "marginWarningLevel",
  "blockedForStocks",
  "stockOrdersReq",
  "stopOutLevel",
  "warningMarginReq",
  "marginBeforeWarning",
  "todayGross",
  "todayNet",
  "todayFees",
  "todayVolume",
  "todayTradesCount",
  "openGrossPnL",
  "openNetPnL",
  "positionsCount",
  "ordersCount",
];

const DEFAULT_POSITION_COLS = [
  "id",
  "tradableInstrumentId",
  "routeId",
  "side",
  "qty",
  "avgPrice",
  "stopLossId",
  "takeProfitId",
  "openDate",
  "unrealizedPl",
  "strategyId",
];

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function firstNum(...vals: unknown[]) {
  for (const v of vals) {
    const n = num(v);
    if (n != null) return n;
  }
  return undefined;
}

function unwrap(body: unknown): Record<string, unknown> {
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const d = root.d && typeof root.d === "object" && !Array.isArray(root.d) ? (root.d as Record<string, unknown>) : {};
  return { ...d, ...root };
}

function pickBalance(a: Record<string, unknown>) {
  const nested = a.account && typeof a.account === "object" ? (a.account as Record<string, unknown>) : {};
  return firstNum(
    a.accountBalance,
    a.aaccountBalance,
    a.balance,
    a.equity,
    a.projectedBalance,
    a.availableFunds,
    a.cashBalance,
    nested.accountBalance,
    nested.aaccountBalance,
    nested.balance,
    nested.equity,
  );
}

type AccRow = {
  id?: string | number;
  accountId?: string | number;
  name?: string;
  currency?: string;
  status?: string;
  accNum?: string | number;
  aaccountBalance?: number;
  accountBalance?: number;
  balance?: number;
  equity?: number;
};

function parseErr(status: number, text: string): string {
  try {
    const j = JSON.parse(text) as { message?: string; error?: string; s?: string };
    return j.message || j.error || text || `TradeLocker ${status}`;
  } catch {
    return text || `TradeLocker ${status}`;
  }
}

function headers(token: string, accNum?: string) {
  const h: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (accNum) h.accNum = accNum;
  return h;
}

function columnIds(cfg: unknown, key?: string, fallback = DEFAULT_DETAIL_COLS): string[] {
  const root = unwrap(cfg);
  const panel = (
    key
      ? root[key]
      : (root.accountDetailsConfig ?? root.accountDetails)
  ) as { columns?: Array<{ id?: string } | string> } | undefined;
  const cols = panel?.columns ?? (Array.isArray(panel) ? panel : []);
  const ids = cols
    .map((c) => (typeof c === "string" ? c : String(c?.id ?? "")))
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? ids : fallback;
}

function stateValues(body: unknown): number[] {
  const root = unwrap(body);
  const raw = root.accountDetailsData ?? root.data;
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => {
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return num(o.v ?? o.value ?? o.n) ?? NaN;
    }
    return num(v) ?? NaN;
  });
}

function extractAccountRows(body: unknown): AccRow[] {
  if (!body) return [];
  if (Array.isArray(body)) return body as AccRow[];
  const root = body as Record<string, unknown>;
  const d = root.d;
  if (Array.isArray(root.accounts)) return root.accounts as AccRow[];
  if (d && typeof d === "object") {
    if (Array.isArray(d)) return d as AccRow[];
    const inner = d as Record<string, unknown>;
    if (Array.isArray(inner.accounts)) return inner.accounts as AccRow[];
  }
  return [];
}

function mapAccount(a: AccRow): TlAccount {
  const rec = a as unknown as Record<string, unknown>;
  const bal = pickBalance(rec);
  return {
    id: String(a.id ?? a.accountId ?? ""),
    name: String(a.name ?? a.id ?? a.accountId ?? ""),
    currency: String(a.currency ?? "USD"),
    status: String(a.status ?? ""),
    accNum: String(a.accNum ?? ""),
    balance: bal,
    equity: firstNum(a.equity, rec.projectedBalance, bal),
    available: firstNum(rec.availableFunds, rec.available),
  };
}

function moneyFromCols(ids: string[], vals: number[]): Omit<TlMoney, "accNum" | "id"> {
  const row: Record<string, number> = {};
  ids.forEach((id, i) => {
    if (Number.isFinite(vals[i])) row[id] = vals[i];
  });
  const balance = firstNum(row.balance, row.cashBalance, vals[0]);
  const equity = firstNum(row.projectedBalance, row.equity, row.balance, balance);
  return {
    balance,
    equity,
    available: firstNum(row.availableFunds, row.withdrawalAvailable, vals[2]),
    todayNet: firstNum(row.todayNet, vals[18]),
    openPnl: firstNum(row.openNetPnL, row.openGrossPnL, vals[23]),
  };
}

async function fetchConfigColumns(env: TlEnv, token: string, accNum: string): Promise<string[]> {
  try {
    const res = await fetch(`${BASE[env]}/trade/config`, { headers: headers(token, accNum) });
    if (!res.ok) return DEFAULT_DETAIL_COLS;
    return columnIds(JSON.parse(await res.text()));
  } catch {
    return DEFAULT_DETAIL_COLS;
  }
}

async function fetchStateValues(env: TlEnv, token: string, account: { id: string; accNum: string }): Promise<number[]> {
  const res = await fetch(`${BASE[env]}/trade/accounts/${account.id}/state`, {
    headers: headers(token, account.accNum),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(parseErr(res.status, text));
  return stateValues(JSON.parse(text));
}

async function listAccounts(env: TlEnv, token: string): Promise<TlAccount[]> {
  const res = await fetch(`${BASE[env]}/auth/jwt/all-accounts`, { headers: headers(token) });
  if (!res.ok) return [];
  return extractAccountRows(await res.json())
    .map(mapAccount)
    .filter((a) => a.id && a.accNum);
}

async function mapPool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) {
    const chunk = await Promise.all(items.slice(i, i + n).map(fn));
    out.push(...chunk);
  }
  return out;
}

function applyMoney(accounts: TlAccount[], money: TlMoney[]): TlAccount[] {
  const byNum = new Map(money.map((m) => [m.accNum, m]));
  return accounts.map((a) => {
    const m = byNum.get(a.accNum);
    if (!m || m.error) return a;
    return {
      ...a,
      balance: m.balance ?? a.balance,
      equity: m.equity ?? m.balance ?? a.equity ?? a.balance,
      available: m.available ?? a.available,
      todayNet: m.todayNet,
      openPnl: m.openPnl,
    };
  });
}

export function leadAccount(accounts: TlAccount[], accNum?: string) {
  return accounts.find((a) => a.accNum === accNum) ?? accounts[0];
}

export function accountEquity(a?: TlAccount) {
  if (!a) return undefined;
  return firstNum(a.equity, a.balance, a.available);
}

export async function refreshAccountMoney(env: TlEnv, token: string, accounts: TlAccount[]): Promise<TlAccount[]> {
  const snap = await listAccounts(env, token);
  const byNum = new Map(snap.map((a) => [a.accNum, a]));
  const merged: TlAccount[] = (accounts.length ? accounts : snap).map((a) => {
    const s = byNum.get(a.accNum);
    if (!s) return a;
    return {
      ...a,
      ...s,
      name: a.name || s.name,
      currency: a.currency || s.currency,
      balance: s.balance ?? a.balance,
      equity: s.equity ?? a.equity ?? s.balance ?? a.balance,
    };
  });
  for (const s of snap) {
    if (!merged.some((a) => a.accNum === s.accNum)) merged.push(s);
  }
  if (!merged.length) return accounts;
  const ids = await fetchConfigColumns(env, token, merged[0].accNum);
  const money = await mapPool(merged, 2, async (a): Promise<TlMoney> => {
    try {
      const vals = await fetchStateValues(env, token, a);
      return { accNum: a.accNum, id: a.id, ...moneyFromCols(ids, vals) };
    } catch (e) {
      return {
        accNum: a.accNum,
        id: a.id,
        error: e instanceof Error ? e.message : "state failed",
      };
    }
  });
  return applyMoney(merged, money);
}

async function fetchPositionColumns(env: TlEnv, token: string, accNum: string): Promise<string[]> {
  try {
    const res = await fetch(`${BASE[env]}/trade/config`, { headers: headers(token, accNum) });
    if (!res.ok) return DEFAULT_POSITION_COLS;
    return columnIds(JSON.parse(await res.text()), "positionsConfig", DEFAULT_POSITION_COLS);
  } catch {
    return DEFAULT_POSITION_COLS;
  }
}

function zipRow(ids: string[], row: unknown[]) {
  const o: Record<string, unknown> = {};
  ids.forEach((id, i) => {
    o[id] = row[i];
  });
  return o;
}

function normSym(name: string) {
  const n = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return n || name;
}

async function fetchInstrumentNames(
  env: TlEnv,
  token: string,
  account: { id: string; accNum: string },
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch(`${BASE[env]}/trade/accounts/${account.id}/instruments`, {
      headers: headers(token, account.accNum),
    });
    if (!res.ok) return map;
    const body = unwrap(JSON.parse(await res.text()));
    const list = Array.isArray(body.instruments) ? body.instruments : [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const i = item as { tradableInstrumentId?: number | string; name?: string };
      const id = String(i.tradableInstrumentId ?? "");
      if (id && i.name) map.set(id, normSym(String(i.name)));
    }
  } catch {
    /* keep empty */
  }
  return map;
}

function parsePositionRow(
  ids: string[],
  row: unknown[],
  account: TlAccount,
  names: Map<string, string>,
): TlOpenTrade | null {
  const r = zipRow(ids, row);
  const id = String(r.id ?? "");
  if (!id) return null;
  const instId = String(r.tradableInstrumentId ?? "");
  const sideRaw = String(r.side ?? "").toLowerCase();
  return {
    id,
    accNum: account.accNum,
    accountId: account.id,
    accountName: account.id,
    currency: account.currency,
    symbol: names.get(instId) ?? instId,
    side: sideRaw.startsWith("s") ? "SELL" : "BUY",
    qty: num(r.qty) ?? 0,
    entry: num(r.avgPrice) ?? 0,
    pnl: num(r.unrealizedPl ?? r.unrealizedPnL ?? r.unrealizedPL),
    openDate: num(r.openDate),
  };
}

async function fetchAccountPositions(
  env: TlEnv,
  token: string,
  account: TlAccount,
  cols: string[],
  names: Map<string, string>,
): Promise<TlOpenTrade[]> {
  const res = await fetch(`${BASE[env]}/trade/accounts/${account.id}/positions`, {
    headers: headers(token, account.accNum),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(parseErr(res.status, text));
  const body = unwrap(JSON.parse(text));
  const rows = Array.isArray(body.positions) ? body.positions : [];
  return rows
    .map((row) => (Array.isArray(row) ? parsePositionRow(cols, row, account, names) : null))
    .filter((t): t is TlOpenTrade => !!t);
}

export async function listOpenTrades(env: TlEnv, token: string, accounts: TlAccount[]): Promise<TlOpenTrade[]> {
  if (!accounts.length) return [];
  const cols = await fetchPositionColumns(env, token, accounts[0].accNum);
  const names = await fetchInstrumentNames(env, token, accounts[0]);
  const nested = await mapPool(accounts, 2, async (a) => {
    try {
      return await fetchAccountPositions(env, token, a, cols, names);
    } catch {
      return [] as TlOpenTrade[];
    }
  });
  return nested.flat();
}

export const tlLogin = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as { email: string; password: string; server: string; env: TlEnv };
    if (!o?.email || !o?.password || !o?.server) throw new Error("Email, password, and server are required");
    const env = normalizeEnv(o.env);
    return {
      email: o.email.trim(),
      password: o.password,
      server: o.server.trim(),
      env,
    };
  })
  .handler(async ({ data }) => {
    const base = BASE[data.env];
    const res = await fetch(`${base}/auth/jwt/token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        server: data.server,
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(parseErr(res.status, text));
    const raw = unwrap(JSON.parse(text));
    const tokens = {
      accessToken: String(raw.accessToken ?? ""),
      refreshToken: String(raw.refreshToken ?? ""),
      expireDate: String(raw.expireDate ?? ""),
    };
    if (!tokens.accessToken) throw new Error("No access token from TradeLocker");

    const accRes = await fetch(`${base}/auth/jwt/all-accounts`, {
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    });
    let accounts: TlAccount[] = [];
    if (accRes.ok) {
      accounts = extractAccountRows(await accRes.json())
        .map(mapAccount)
        .filter((a) => a.id && a.accNum);
    }

    const withState = await refreshAccountMoney(data.env, tokens.accessToken, accounts);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expireDate: tokens.expireDate,
      email: data.email,
      env: data.env,
      server: data.server,
      accounts: withState,
    };
  });

export const tlRefreshMoney = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as { env: TlEnv; token: string; accounts: TlAccount[] };
    if (!o?.token) throw new Error("Missing token");
    const accounts = Array.isArray(o.accounts) ? o.accounts : [];
    return {
      env: normalizeEnv(o.env),
      token: o.token,
      accounts: accounts.map((a) => ({
        id: String(a.id ?? ""),
        name: String(a.name ?? a.id ?? ""),
        currency: String(a.currency ?? "USD"),
        status: String(a.status ?? ""),
        accNum: String(a.accNum ?? ""),
        balance: num(a.balance),
        equity: num(a.equity),
        available: num(a.available),
        todayNet: num(a.todayNet),
        openPnl: num(a.openPnl),
      })),
    };
  })
  .handler(async ({ data }) => refreshAccountMoney(data.env, data.token, data.accounts));

export const tlOpenTrades = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as { env: TlEnv; token: string; accounts: TlAccount[] };
    if (!o?.token) throw new Error("Missing token");
    const accounts = Array.isArray(o.accounts) ? o.accounts : [];
    return {
      env: normalizeEnv(o.env),
      token: o.token,
      accounts: accounts.map((a) => ({
        id: String(a.id ?? ""),
        name: String(a.name ?? a.id ?? ""),
        currency: String(a.currency ?? "USD"),
        status: String(a.status ?? ""),
        accNum: String(a.accNum ?? ""),
      })),
    };
  })
  .handler(async ({ data }) => listOpenTrades(data.env, data.token, data.accounts));

export const tlPlace = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as {
      env: TlEnv;
      token: string;
      refreshToken?: string;
      accountId: string;
      accNum: string;
      symbol: string;
      side: "BUY" | "SELL";
      sl: number;
      tp: number;
      qty: number;
    };
    if (!o?.token || !o.accountId || !o.accNum || !o.symbol) throw new Error("Missing TradeLocker order fields");
    if (o.side !== "BUY" && o.side !== "SELL") throw new Error("Invalid TradeLocker order side");
    if (![o.sl, o.tp, o.qty].every((v) => Number.isFinite(v) && v > 0)) {
      throw new Error("TradeLocker quantity, stop loss and take profit must be positive numbers");
    }
    return { ...o, env: normalizeEnv(o.env) };
  })
  .handler(async ({ data }) => {
    const base = BASE[data.env];
    let accessToken = data.token;
    let refreshToken = data.refreshToken ?? "";
    const makeHeaders = () => ({
      accept: "application/json",
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      accNum: data.accNum,
    });
    const refresh = async () => {
      if (!refreshToken) return false;
      const res = await fetch(`${base}/auth/jwt/refresh`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const next = unwrap(JSON.parse(await res.text()));
      const nextAccess = String(next.accessToken ?? "");
      if (!nextAccess) return false;
      accessToken = nextAccess;
      refreshToken = String(next.refreshToken ?? refreshToken);
      return true;
    };
    const authedFetch = async (url: string, init: RequestInit = {}) => {
      let res = await fetch(url, { ...init, headers: makeHeaders() });
      if (res.status === 401 && (await refresh())) {
        res = await fetch(url, { ...init, headers: makeHeaders() });
      }
      return res;
    };
    const instRes = await authedFetch(`${base}/trade/accounts/${data.accountId}/instruments`);
    const instText = await instRes.text();
    if (!instRes.ok) throw new Error(parseErr(instRes.status, instText));
    const instBody = unwrap(JSON.parse(instText)) as {
        instruments?: Array<{
          tradableInstrumentId: number;
          name: string;
          routes?: Array<{ id: number; type: string }>;
        }>;
    };
    const want = data.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const inst = (instBody.instruments ?? []).find((i) => {
      const n = i.name.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return n === want || n.includes(want) || want.includes(n);
    });
    if (!inst) throw new Error(`No TradeLocker instrument for ${data.symbol} on ${data.accountId}`);
    const route = inst.routes?.find((r) => r.type === "TRADE") ?? inst.routes?.[0];
    if (!route) throw new Error(`No TRADE route for ${inst.name}`);
    const body = {
      qty: data.qty,
      routeId: route.id,
      side: data.side === "BUY" ? "buy" : "sell",
      validity: "IOC",
      type: "market",
      tradableInstrumentId: inst.tradableInstrumentId,
      price: 0,
      stopLoss: data.sl,
      stopLossType: "absolute",
      takeProfit: data.tp,
      takeProfitType: "absolute",
    };
    const ord = await authedFetch(`${base}/trade/accounts/${data.accountId}/orders`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const ot = await ord.text();
    if (!ord.ok) throw new Error(parseErr(ord.status, ot));
    let receipt: Record<string, unknown> = {};
    try {
      receipt = unwrap(JSON.parse(ot));
    } catch {
      receipt = {};
    }
    const apiStatus = String(receipt.s ?? receipt.status ?? "").toLowerCase();
    if (["error", "failed", "rejected"].includes(apiStatus) || receipt.error) {
      throw new Error(String(receipt.message ?? receipt.error ?? "TradeLocker rejected the order"));
    }
    return {
      ok: true as const,
      accountId: data.accountId,
      orderId: String(receipt.orderId ?? receipt.id ?? receipt.order_id ?? ""),
      status: apiStatus || "accepted",
      accessToken,
      refreshToken,
    };
  });
