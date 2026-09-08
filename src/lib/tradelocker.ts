import { createServerFn } from "@tanstack/react-start";

export type TlEnv = "demo" | "live";

export type TlAccount = {
  id: string;
  name: string;
  currency: string;
  status: string;
  accNum: string;
  balance?: number;
};

const BASE: Record<TlEnv, string> = {
  demo: "https://demo.tradelocker.com/backend-api",
  live: "https://live.tradelocker.com/backend-api",
};

function parseErr(status: number, text: string): string {
  try {
    const j = JSON.parse(text) as { message?: string; error?: string };
    return j.message || j.error || text || `TradeLocker ${status}`;
  } catch {
    return text || `TradeLocker ${status}`;
  }
}

export const tlLogin = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as { email: string; password: string; server: string; env: TlEnv };
    if (!o?.email || !o?.password || !o?.server) throw new Error("Email, password, and server are required");
    if (o.env !== "demo" && o.env !== "live") throw new Error("Choose demo or live");
    return {
      email: o.email.trim(),
      password: o.password,
      server: o.server.trim(),
      env: o.env,
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
    const tokens = JSON.parse(text) as {
      accessToken: string;
      refreshToken: string;
      expireDate: string;
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
      const body = (await accRes.json()) as {
        accounts?: Array<{
          id: string;
          name: string;
          currency: string;
          status: string;
          accNum: string;
          aaccountBalance?: number;
          accountBalance?: number;
        }>;
      };
      accounts = (body.accounts ?? []).map((a) => ({
        id: String(a.id),
        name: a.name,
        currency: a.currency,
        status: a.status,
        accNum: String(a.accNum),
        balance: a.accountBalance ?? a.aaccountBalance,
      }));
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expireDate: tokens.expireDate,
      email: data.email,
      env: data.env,
      server: data.server,
      accounts,
    };
  });

export const tlPlace = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as {
      env: TlEnv;
      token: string;
      accountId: string;
      accNum: string;
      symbol: string;
      side: "BUY" | "SELL";
      sl: number;
      tp: number;
      qty: number;
    };
    if (!o?.token || !o.accountId || !o.accNum || !o.symbol) throw new Error("Missing TradeLocker order fields");
    return o;
  })
  .handler(async ({ data }) => {
    const base = BASE[data.env];
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      Authorization: `Bearer ${data.token}`,
      accNum: data.accNum,
    };
    const instRes = await fetch(`${base}/trade/accounts/${data.accountId}/instruments`, { headers });
    const instText = await instRes.text();
    if (!instRes.ok) throw new Error(parseErr(instRes.status, instText));
    const instBody = JSON.parse(instText) as {
      d?: {
        instruments?: Array<{
          tradableInstrumentId: number;
          name: string;
          routes?: Array<{ id: number; type: string }>;
        }>;
      };
    };
    const want = data.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const inst = (instBody.d?.instruments ?? []).find((i) => {
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
    const ord = await fetch(`${base}/trade/accounts/${data.accountId}/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const ot = await ord.text();
    if (!ord.ok) throw new Error(parseErr(ord.status, ot));
    return { ok: true as const, accountId: data.accountId, raw: ot.slice(0, 300) };
  });
