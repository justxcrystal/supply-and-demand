const BASE = {
  demo: "https://demo.tradelocker.com/backend-api",
  broker: "https://demo.tradelocker.com/backend-api",
  live: "https://live.tradelocker.com/backend-api",
  bsa: "https://bsa.tradelocker.com/backend-api",
  bsb: "https://bsb.tradelocker.com/backend-api",
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

function jwtLeftMs(token, expireDate) {
  if (expireDate) {
    const t = Date.parse(expireDate);
    if (Number.isFinite(t)) return t - Date.now();
  }
  try {
    const part = token.split(".")[1];
    if (!part) return 0;
    const payload = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return payload.exp ? payload.exp * 1000 - Date.now() : 0;
  } catch {
    return 0;
  }
}

function resolution(tf) {
  if (tf === 1) return "1m";
  if (tf === 5) return "5m";
  if (tf === 15) return "15m";
  if (tf === 30) return "30m";
  if (tf === 60) return "1H";
  throw new Error(`Unsupported TradeLocker timeframe ${tf}`);
}

export class TradeLockerClient {
  constructor(config) {
    this.config = config;
    const env = String(config.env ?? "demo").toLowerCase();
    this.base = String(config.baseUrl ?? "").replace(/\/$/, "") || BASE[env] || BASE.demo;
    this.accessToken = "";
    this.refreshToken = "";
    this.expireDate = "";
    this.account = null;
    this.instrumentCache = null;
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

    const requestedId = String(this.config.accountId ?? "").trim();
    const requestedNum = String(this.config.accountNum ?? "").trim();
    this.account =
      (requestedId ? accounts.find((a) => a.id === requestedId) : null) ??
      (requestedNum ? accounts.find((a) => a.accNum === requestedNum) : null) ??
      (!requestedId && !requestedNum ? accounts[0] : null);

    if (!this.account) {
      const wanted = requestedId ? `account ID ${requestedId}` : `accNum ${requestedNum}`;
      throw new Error(`TradeLocker ${wanted} was not found after login`);
    }
    this.instrumentCache = null;
    return this.account;
  }

  async refreshJwt() {
    if (!this.refreshToken) return this.login();
    try {
      const res = await fetch(`${this.base}/auth/jwt/refresh`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
        signal: AbortSignal.timeout(12000),
      });
      const raw = unwrap(await checkedJson(res, "TradeLocker token refresh"));
      const accessToken = String(raw.accessToken ?? "");
      if (!accessToken) throw new Error("TradeLocker refresh returned no access token");
      this.accessToken = accessToken;
      this.refreshToken = String(raw.refreshToken ?? this.refreshToken);
      this.expireDate = String(raw.expireDate ?? "");
      return this.account;
    } catch {
      return this.login();
    }
  }

  async ensureLogin() {
    if (!this.accessToken || !this.account) return this.login();
    if (jwtLeftMs(this.accessToken, this.expireDate) < 10 * 60 * 1000) return this.refreshJwt();
    return this.account;
  }

  async authFetch(url, options = {}) {
    await this.ensureLogin();
    const run = () =>
      fetch(url, {
        ...options,
        headers: { ...headers(this.accessToken, this.account?.accNum), ...(options.headers ?? {}) },
        signal: options.signal ?? AbortSignal.timeout(12000),
      });
    let res = await run();
    if (res.status === 401 || res.status === 403) {
      await this.refreshJwt();
      res = await run();
    }
    return res;
  }

  async instruments() {
    await this.ensureLogin();
    if (this.instrumentCache) return this.instrumentCache;
    const res = await this.authFetch(`${this.base}/trade/accounts/${this.account.id}/instruments`);
    const body = unwrap(await checkedJson(res, "TradeLocker instruments"));
    this.instrumentCache = Array.isArray(body.instruments) ? body.instruments : [];
    return this.instrumentCache;
  }

  async instrumentFor(symbol) {
    const instruments = await this.instruments();
    const want = normalize(symbol);
    const matches = instruments
      .map((instrument) => ({ instrument, name: normalize(instrument.name) }))
      .filter((x) => x.name === want || x.name.startsWith(want));
    const exact = matches.find((x) => x.name === want);
    const selected = exact?.instrument ?? (matches.length === 1 ? matches[0].instrument : null);
    if (!selected) throw new Error(`No unique TradeLocker instrument for ${symbol}`);
    return selected;
  }

  async history(symbol, tf, bars = 180) {
    const instrument = await this.instrumentFor(symbol);
    const route = instrument.routes?.find((r) => r.type === "INFO");
    if (!route) throw new Error(`No INFO route for ${instrument.name}`);
    const to = Date.now();
    const from = to - Math.max(240, bars + 30) * tf * 60_000;
    const params = new URLSearchParams({
      routeId: String(route.id),
      from: String(from),
      to: String(to),
      resolution: resolution(tf),
      tradableInstrumentId: String(instrument.tradableInstrumentId),
    });
    const res = await this.authFetch(`${this.base}/trade/history?${params.toString()}`);
    const body = unwrap(await checkedJson(res, "TradeLocker history"));
    const rows = Array.isArray(body.barDetails) ? body.barDetails : [];
    const candles = rows
      .map((b) => ({
        t: Number(b.t),
        o: Number(b.o),
        h: Number(b.h),
        l: Number(b.l),
        c: Number(b.c),
        v: Number(b.v ?? 0),
      }))
      .filter((b) => [b.t, b.o, b.h, b.l, b.c].every(Number.isFinite))
      .sort((a, b) => a.t - b.t)
      .slice(-bars);
    if (candles.length < 40) throw new Error(`TradeLocker returned only ${candles.length} bars for ${symbol}`);
    return candles;
  }

  async openPositions() {
    const res = await this.authFetch(`${this.base}/trade/accounts/${this.account.id}/positions`);
    const body = unwrap(await checkedJson(res, "TradeLocker positions"));
    return Array.isArray(body.positions) ? body.positions : [];
  }

  async placeMarketOrder({ symbol, side, qty, sl, tp }) {
    const selected = await this.instrumentFor(symbol);
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
      body: JSON.stringify(body),
    });
    const result = await checkedJson(res, "TradeLocker order");
    if (result.s !== "ok") throw new Error(String(result.message ?? result.error ?? result.s ?? "Order was not accepted"));
    return result;
  }
}
