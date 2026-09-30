const BASE = {
  broker: "https://demo.tradelocker.com/backend-api",
  live: "https://live.tradelocker.com/backend-api",
};

function unwrap(body) {
  const root = body && typeof body === "object" ? body : {};
  const d = root.d && typeof root.d === "object" && !Array.isArray(root.d) ? root.d : {};
  return { ...d, ...root };
}

function extractAccountRows(body) {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.accounts)) return body.accounts;
  if (body.d && typeof body.d === "object") {
    if (Array.isArray(body.d)) return body.d;
    if (Array.isArray(body.d.accounts)) return body.d.accounts;
  }
  return [];
}

async function checkedJson(res, label) {
  const text = await res.text();
  if (!res.ok) throw new Error(`${label} ${res.status}: ${text.slice(0, 240)}`);
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new Error(`${label} returned unreadable JSON`);
  }
}

function headers(token, accNum) {
  const h = {
    accept: "application/json",
    "content-type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (accNum) h.accNum = accNum;
  return h;
}

function normalize(name) {
  return String(name ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export class TradeLockerClient {
  constructor(config) {
    this.config = config;
    this.base = BASE[config.env === "live" ? "live" : "broker"];
    this.accessToken = "";
    this.refreshToken = "";
    this.expireDate = "";
    this.account = null;
  }

  async login() {
    const res = await fetch(`${this.base}/auth/jwt/token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        email: this.config.email,
        password: this.config.password,
        server: this.config.server,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const raw = unwrap(await checkedJson(res, "TradeLocker login"));
    this.accessToken = String(raw.accessToken ?? "");
    this.refreshToken = String(raw.refreshToken ?? "");
    this.expireDate = String(raw.expireDate ?? "");
    if (!this.accessToken) throw new Error("TradeLocker login returned no access token");

    const ares = await fetch(`${this.base}/auth/jwt/all-accounts`, {
      headers: headers(this.accessToken),
      signal: AbortSignal.timeout(12000),
    });
    const accounts = extractAccountRows(await checkedJson(ares, "TradeLocker accounts"))
      .map((a) => ({
        id: String(a.id ?? a.accountId ?? ""),
        accNum: String(a.accNum ?? ""),
        name: String(a.name ?? a.id ?? a.accountId ?? ""),
      }))
      .filter((a) => a.id && a.accNum);
    if (!accounts.length) throw new Error("TradeLocker returned no usable accounts");
    const requested = String(this.config.accountNum ?? "").trim();
    this.account = requested ? accounts.find((a) => a.accNum === requested) : accounts[0];
    if (!this.account) throw new Error(`TradeLocker account ${requested} was not found`);
    return this.account;
  }

  async ensureLogin() {
    if (!this.accessToken || !this.account) await this.login();
  }

  async authFetch(url, options = {}) {
    await this.ensureLogin();
    const run = () => fetch(url, {
      ...options,
      headers: { ...headers(this.accessToken, this.account?.accNum), ...(options.headers ?? {}) },
      signal: options.signal ?? AbortSignal.timeout(12000),
    });
    let res = await run();
    if (res.status === 401 || res.status === 403) {
      await this.login();
      res = await run();
    }
    return res;
  }

  async openPositions() {
    const res = await this.authFetch(`${this.base}/trade/accounts/${this.account.id}/positions`);
    const body = unwrap(await checkedJson(res, "TradeLocker positions"));
    return Array.isArray(body.positions) ? body.positions : [];
  }

  async placeMarketOrder({ symbol, side, qty, sl, tp }) {
    await this.ensureLogin();
    const h = headers(this.accessToken, this.account.accNum);
    const instRes = await this.authFetch(`${this.base}/trade/accounts/${this.account.id}/instruments`, { headers: h });
    const instBody = unwrap(await checkedJson(instRes, "TradeLocker instruments"));
    const instruments = Array.isArray(instBody.instruments) ? instBody.instruments : [];
    const want = normalize(symbol);
    const matches = instruments
      .map((instrument) => ({ instrument, name: normalize(instrument.name) }))
      .filter((x) => x.name === want || x.name.startsWith(want));
    const exact = matches.find((x) => x.name === want);
    const selected = exact?.instrument ?? (matches.length === 1 ? matches[0].instrument : null);
    if (!selected) throw new Error(`No unique TradeLocker instrument for ${symbol}`);
    const route = selected.routes?.find((r) => r.type === "TRADE");
    if (!route) throw new Error(`No TRADE route for ${selected.name}`);

    const body = {
      qty,
      routeId: route.id,
      side: side === "BUY" ? "buy" : "sell",
      validity: "IOC",
      type: "market",
      tradableInstrumentId: selected.tradableInstrumentId,
      price: 0,
      stopLoss: sl,
      stopLossType: "absolute",
      takeProfit: tp,
      takeProfitType: "absolute",
    };
    const res = await this.authFetch(`${this.base}/trade/accounts/${this.account.id}/orders`, {
      method: "POST",
      headers: h,
      body: JSON.stringify(body),
    });
    const result = await checkedJson(res, "TradeLocker order");
    if (result.s !== "ok") throw new Error(String(result.message ?? result.error ?? result.s ?? "Order was not accepted"));
    return result;
  }
}
