import type { Market } from "./types";

export const UNIVERSE: Market[] = [
  { id: "NAS100", yahoo: "NQ=F", name: "Nasdaq 100", kind: "index", pip: 0.25, digits: 2 },
  { id: "US30", yahoo: "YM=F", name: "Dow Jones 30", kind: "index", pip: 1, digits: 1 },
  { id: "BTCUSD", yahoo: "BTC-USD", name: "Bitcoin", kind: "crypto", pip: 1, digits: 1 },
  { id: "EURUSD", yahoo: "EURUSD=X", name: "Euro / Dollar", kind: "fx", pip: 0.0001, digits: 5 },
  { id: "GBPUSD", yahoo: "GBPUSD=X", name: "Cable", kind: "fx", pip: 0.0001, digits: 5 },
  { id: "USDJPY", yahoo: "USDJPY=X", name: "Dollar / Yen", kind: "fx", pip: 0.01, digits: 3 },
  { id: "AUDUSD", yahoo: "AUDUSD=X", name: "Aussie", kind: "fx", pip: 0.0001, digits: 5 },
  { id: "USDCAD", yahoo: "USDCAD=X", name: "Loonie", kind: "fx", pip: 0.0001, digits: 5 },
  { id: "USDCHF", yahoo: "USDCHF=X", name: "Swissy", kind: "fx", pip: 0.0001, digits: 5 },
  { id: "NZDUSD", yahoo: "NZDUSD=X", name: "Kiwi", kind: "fx", pip: 0.0001, digits: 5 },
  { id: "EURJPY", yahoo: "EURJPY=X", name: "Euro / Yen", kind: "fx", pip: 0.01, digits: 3 },
  { id: "GBPJPY", yahoo: "GBPJPY=X", name: "Sterling / Yen", kind: "fx", pip: 0.01, digits: 3 },
  { id: "EURGBP", yahoo: "EURGBP=X", name: "Euro / Sterling", kind: "fx", pip: 0.0001, digits: 5 },
  { id: "XAUUSD", yahoo: "GC=F", name: "Gold", kind: "metal", pip: 0.1, digits: 2 },
];

export const BASE: Record<string, number> = {
  NAS100: 19680,
  US30: 41520,
  BTCUSD: 64250,
  EURUSD: 1.0874,
  GBPUSD: 1.3122,
  USDJPY: 146.82,
  AUDUSD: 0.6721,
  USDCAD: 1.3588,
  USDCHF: 0.8014,
  NZDUSD: 0.6098,
  EURJPY: 159.62,
  GBPJPY: 192.68,
  EURGBP: 0.8286,
  XAUUSD: 2518.4,
};

export function marketById(id: string): Market {
  const m = UNIVERSE.find((x) => x.id === id);
  if (!m) throw new Error("unknown market " + id);
  return m;
}

export function fmt(meta: Market, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return Number(v).toFixed(meta.digits);
}
