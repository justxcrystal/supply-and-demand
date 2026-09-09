import { createHash, createHmac, randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";

export type WbEnv = "paper" | "live";

export type WbAccount = {
  id: string;
  number: string;
  label: string;
  type: string;
  currency: string;
  equity?: number;
  cash?: number;
  buyingPower?: number;
};

export type WbOpenTrade = {
  id: string;
  accountId: string;
  accountName: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  entry: number;
  pnl?: number;
  currency: string;
};

const HOST: Record<WbEnv, { host: string; origin: string }> = {
  paper: { host: "api.sandbox.webull.com", origin: "https://api.sandbox.webull.com" },
  live: { host: "api.webull.com", origin: "https://api.webull.com" },
};

export function normalizeWbEnv(v: unknown): WbEnv {
  return v === "live" ? "live" : "paper";
}

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

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asArr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  const o = asObj(v);
  if (Array.isArray(o.data)) return o.data;
  if (Array.isArray(o.list)) return o.list;
  if (Array.isArray(o.accounts)) return o.accounts;
  if (Array.isArray(o.positions)) return o.positions;
  return [];
}

function parseErr(status: number, text: string) {
  try {
    const j = JSON.parse(text) as { message?: string; msg?: string; error?: string; error_msg?: string };
    return j.message || j.msg || j.error || j.error_msg || text || `Webull ${status}`;
  } catch {
    return text || `Webull ${status}`;
  }
}

function sign(secret: string, host: string, path: string, query: Record<string, string>, headers: Record<string, string>, body?: string) {
  const params: Record<string, string> = {
    ...query,
    "x-app-key": headers["x-app-key"],
    "x-signature-algorithm": headers["x-signature-algorithm"],
    "x-signature-version": headers["x-signature-version"],
    "x-signature-nonce": headers["x-signature-nonce"],
    "x-timestamp": headers["x-timestamp"],
    host,
  };
  const str1 = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  let str3 = `${path}&${str1}`;
  if (body) str3 += `&${createHash("md5").update(body).digest("hex").toUpperCase()}`;
  return createHmac("sha1", `${secret}&`).update(encodeURIComponent(str3)).digest("base64");
}

async function wbFetch(opts: {
  env: WbEnv;
  appKey: string;
  appSecret: string;
  token?: string;
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}) {
  const { host, origin } = HOST[opts.env];
  const query = opts.query ?? {};
  const qs = Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join("&");
  const body = opts.body == null ? "" : JSON.stringify(opts.body);
  const headers: Record<string, string> = {
    accept: "application/json",
    "x-app-key": opts.appKey,
    "x-timestamp": new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    "x-signature-version": "1.0",
    "x-signature-algorithm": "HMAC-SHA1",
    "x-signature-nonce": randomUUID().replaceAll("-", ""),
    "x-version": "v2",
  };
  if (opts.token) headers["x-access-token"] = opts.token;
  if (body) headers["content-type"] = "application/json";
  headers["x-signature"] = sign(opts.appSecret, host, opts.path, query, headers, body || undefined);
  const url = `${origin}${opts.path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { method: opts.method, headers, body: body || undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(parseErr(res.status, text));
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export function frontMonth(product: string) {
  const now = new Date();
  let year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const quarterly = ["MNQ", "NQ", "MES", "ES"].includes(product);
  const cycle: Array<[number, string]> = quarterly
    ? [
        [3, "H"],
        [6, "M"],
        [9, "U"],
        [12, "Z"],
      ]
    : [
        [1, "F"],
        [2, "G"],
        [3, "H"],
        [4, "J"],
        [5, "K"],
        [6, "M"],
        [7, "N"],
        [8, "Q"],
        [9, "U"],
        [10, "V"],
        [11, "X"],
        [12, "Z"],
      ];
  let letter = cycle[0][1];
  const hit = cycle.find(([m]) => m >= month);
  if (hit) letter = hit[1];
  else {
    letter = cycle[0][1];
    year += 1;
  }
  return `${product}${letter}${year % 10}`;
}

function mapAccount(raw: unknown): WbAccount | null {
  const a = asObj(raw);
  const id = String(a.account_id ?? a.accountId ?? a.id ?? "");
  if (!id) return null;
  return {
    id,
    number: String(a.account_number ?? a.accountNumber ?? ""),
    label: String(a.account_label ?? a.account_class ?? a.accountType ?? a.label ?? "Webull"),
    type: String(a.account_class ?? a.account_type ?? a.accountType ?? ""),
    currency: String(a.currency ?? "USD"),
    equity: firstNum(a.equity, a.net_liquidation, a.netLiquidation, a.total_market_value),
    cash: firstNum(a.total_cash, a.cash, a.cash_balance),
    buyingPower: firstNum(a.buying_power, a.buyingPower),
  };
}

function moneyFromBalance(raw: unknown) {
  const o = asObj(raw);
  const inner = asObj(o.data);
  const src = { ...o, ...inner };
  return {
    equity: firstNum(
      src.net_liquidation,
      src.netLiquidation,
      src.total_market_value,
      src.equity,
      src.total_value,
      src.netLiquidationValue,
    ),
    cash: firstNum(src.total_cash, src.cash, src.cash_balance, src.settled_cash),
    buyingPower: firstNum(src.buying_power, src.buyingPower, src.day_buying_power),
  };
}

async function listAccounts(env: WbEnv, appKey: string, appSecret: string, token: string) {
  const body = await wbFetch({ env, appKey, appSecret, token, method: "GET", path: "/trading/accounts/list" });
  return asArr(body).map(mapAccount).filter((a): a is WbAccount => !!a);
}

async function refreshAccounts(env: WbEnv, appKey: string, appSecret: string, token: string, accounts: WbAccount[]) {
  const listed = await listAccounts(env, appKey, appSecret, token);
  const merged = (accounts.length ? accounts : listed).map((a) => listed.find((x) => x.id === a.id) ?? a);
  for (const a of listed) if (!merged.some((x) => x.id === a.id)) merged.push(a);
  const withMoney = [];
  for (const a of merged) {
    try {
      const bal = await wbFetch({
        env,
        appKey,
        appSecret,
        token,
        method: "GET",
        path: "/trading/assets/balances/get",
        query: { account_id: a.id },
      });
      const m = moneyFromBalance(bal);
      withMoney.push({ ...a, equity: m.equity ?? a.equity, cash: m.cash ?? a.cash, buyingPower: m.buyingPower ?? a.buyingPower });
    } catch {
      withMoney.push(a);
    }
  }
  return withMoney;
}

function mapPosition(raw: unknown, account: WbAccount): WbOpenTrade | null {
  const p = asObj(raw);
  const id = String(p.position_id ?? p.id ?? p.symbol ?? "");
  const symbol = String(p.symbol ?? p.tickerId ?? "");
  if (!id && !symbol) return null;
  const sideRaw = String(p.side ?? p.position_side ?? "").toLowerCase();
  const qty = firstNum(p.quantity, p.qty, p.position, p.open_qty) ?? 0;
  if (!qty) return null;
  return {
    id: id || `${account.id}-${symbol}`,
    accountId: account.id,
    accountName: account.label || account.id,
    symbol,
    side: sideRaw.startsWith("s") || qty < 0 ? "SELL" : "BUY",
    qty: Math.abs(qty),
    entry: firstNum(p.average_price, p.avgPrice, p.avg_price, p.cost_price) ?? 0,
    pnl: firstNum(p.unrealized_profit_loss, p.unrealizedPnl, p.unrealized_pnl, p.pnl),
    currency: account.currency,
  };
}

async function listTrades(env: WbEnv, appKey: string, appSecret: string, token: string, accounts: WbAccount[]) {
  const out: WbOpenTrade[] = [];
  for (const a of accounts) {
    try {
      const body = await wbFetch({
        env,
        appKey,
        appSecret,
        token,
        method: "GET",
        path: "/trading/assets/positions/list",
        query: { account_id: a.id },
      });
      for (const row of asArr(body)) {
        const t = mapPosition(row, a);
        if (t) out.push(t);
      }
    } catch {
      /* skip account */
    }
  }
  return out;
}

export const wbLogin = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as { appKey: string; appSecret: string; env: WbEnv };
    if (!o?.appKey || !o?.appSecret) throw new Error("App key and app secret are required");
    return { appKey: o.appKey.trim(), appSecret: o.appSecret.trim(), env: normalizeWbEnv(o.env) };
  })
  .handler(async ({ data }) => {
    const tok = asObj(
      await wbFetch({
        env: data.env,
        appKey: data.appKey,
        appSecret: data.appSecret,
        method: "POST",
        path: "/auth/tokens/create",
      }),
    );
    const token = String(tok.token ?? tok.access_token ?? "");
    if (!token) throw new Error("No token from Webull");
    const status = String(tok.status ?? "NORMAL").toUpperCase();
    if (status === "PENDING") {
      throw new Error("Approve this login in the Webull app (2FA), then try again.");
    }
    if (status && status !== "NORMAL") throw new Error(`Webull token ${status}`);
    const accounts = await refreshAccounts(data.env, data.appKey, data.appSecret, token, []);
    return {
      token,
      expiresAt: String(tok.expires_at ?? tok.expiresAt ?? ""),
      env: data.env,
      appKey: data.appKey,
      appSecret: data.appSecret,
      accounts,
    };
  });

export const wbRefresh = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as { env: WbEnv; appKey: string; appSecret: string; token: string; accounts: WbAccount[] };
    if (!o?.token || !o.appKey || !o.appSecret) throw new Error("Missing Webull session");
    return {
      env: normalizeWbEnv(o.env),
      appKey: o.appKey,
      appSecret: o.appSecret,
      token: o.token,
      accounts: Array.isArray(o.accounts) ? o.accounts : [],
    };
  })
  .handler(async ({ data }) => refreshAccounts(data.env, data.appKey, data.appSecret, data.token, data.accounts));

export const wbOpenTrades = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as { env: WbEnv; appKey: string; appSecret: string; token: string; accounts: WbAccount[] };
    if (!o?.token || !o.appKey || !o.appSecret) throw new Error("Missing Webull session");
    return {
      env: normalizeWbEnv(o.env),
      appKey: o.appKey,
      appSecret: o.appSecret,
      token: o.token,
      accounts: Array.isArray(o.accounts) ? o.accounts : [],
    };
  })
  .handler(async ({ data }) => listTrades(data.env, data.appKey, data.appSecret, data.token, data.accounts));

async function placeFutures(opts: {
  env: WbEnv;
  appKey: string;
  appSecret: string;
  token: string;
  accountId: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
}) {
  const body = {
    account_id: opts.accountId,
    new_orders: [
      {
        combo_type: "NORMAL",
        client_order_id: randomUUID().replaceAll("-", "").slice(0, 32),
        symbol: opts.symbol,
        instrument_type: "FUTURES",
        market: "US",
        order_type: "MARKET",
        quantity: String(opts.qty),
        side: opts.side,
        time_in_force: "DAY",
        entrust_type: "QTY",
      },
    ],
  };
  const raw = await wbFetch({
    env: opts.env,
    appKey: opts.appKey,
    appSecret: opts.appSecret,
    token: opts.token,
    method: "POST",
    path: "/trading/orders/place",
    body,
  });
  return { ok: true as const, symbol: opts.symbol, raw: JSON.stringify(raw).slice(0, 300) };
}

export const wbPlace = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as {
      env: WbEnv;
      appKey: string;
      appSecret: string;
      token: string;
      accountId: string;
      product: string;
      side: "BUY" | "SELL";
      qty: number;
    };
    if (!o?.token || !o.accountId || !o.product) throw new Error("Missing Webull order fields");
    return {
      env: normalizeWbEnv(o.env),
      appKey: String(o.appKey),
      appSecret: String(o.appSecret),
      token: o.token,
      accountId: o.accountId,
      product: o.product,
      side: (o.side === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL",
      qty: Math.max(1, Math.round(Number(o.qty) || 1)),
    };
  })
  .handler(async ({ data }) =>
    placeFutures({
      env: data.env,
      appKey: data.appKey,
      appSecret: data.appSecret,
      token: data.token,
      accountId: data.accountId,
      symbol: frontMonth(data.product),
      side: data.side,
      qty: data.qty,
    }),
  );

export const wbFlatten = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as { env: WbEnv; appKey: string; appSecret: string; token: string; accounts: WbAccount[] };
    if (!o?.token || !o.appKey || !o.appSecret) throw new Error("Missing Webull session");
    return {
      env: normalizeWbEnv(o.env),
      appKey: o.appKey,
      appSecret: o.appSecret,
      token: o.token,
      accounts: Array.isArray(o.accounts) ? o.accounts : [],
    };
  })
  .handler(async ({ data }) => {
    const trades = await listTrades(data.env, data.appKey, data.appSecret, data.token, data.accounts);
    if (!trades.length) return [{ acc: "Webull", ok: true, msg: "already flat" }];
    const rows: Array<{ acc: string; ok: boolean; msg: string }> = [];
    for (const t of trades) {
      try {
        await placeFutures({
          env: data.env,
          appKey: data.appKey,
          appSecret: data.appSecret,
          token: data.token,
          accountId: t.accountId,
          symbol: t.symbol,
          side: t.side === "BUY" ? "SELL" : "BUY",
          qty: Math.max(1, Math.round(t.qty)),
        });
        rows.push({ acc: `${t.accountName} · ${t.symbol}`, ok: true, msg: "flattened" });
      } catch (e) {
        rows.push({
          acc: `${t.accountName} · ${t.symbol}`,
          ok: false,
          msg: e instanceof Error ? e.message : "flatten failed",
        });
      }
    }
    return rows;
  });

export function wbEquity(a?: WbAccount) {
  if (!a) return undefined;
  return firstNum(a.equity, a.cash, a.buyingPower);
}