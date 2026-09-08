import type { Book, Market } from "./types";

export const UNIVERSE: Market[] = [
  { id: "BTCUSD", yahoo: "BTC-USD", name: "Bitcoin", kind: "crypto", book: "forex", pip: 1, digits: 1 },
  { id: "ETHUSD", yahoo: "ETH-USD", name: "Ethereum", kind: "crypto", book: "forex", pip: 0.01, digits: 2 },
  { id: "NAS100", yahoo: "NQ=F", name: "Nasdaq 100", kind: "index", book: "forex", pip: 0.25, digits: 2 },
  { id: "US30", yahoo: "YM=F", name: "Dow Jones 30", kind: "index", book: "forex", pip: 1, digits: 1 },
  { id: "EURUSD", yahoo: "EURUSD=X", name: "Euro / Dollar", kind: "fx", book: "forex", pip: 0.0001, digits: 5 },
  { id: "GBPUSD", yahoo: "GBPUSD=X", name: "Cable", kind: "fx", book: "forex", pip: 0.0001, digits: 5 },
  { id: "USDJPY", yahoo: "USDJPY=X", name: "Dollar / Yen", kind: "fx", book: "forex", pip: 0.01, digits: 3 },
  { id: "AUDUSD", yahoo: "AUDUSD=X", name: "Aussie", kind: "fx", book: "forex", pip: 0.0001, digits: 5 },
  { id: "USDCAD", yahoo: "USDCAD=X", name: "Loonie", kind: "fx", book: "forex", pip: 0.0001, digits: 5 },
  { id: "USDCHF", yahoo: "USDCHF=X", name: "Swissy", kind: "fx", book: "forex", pip: 0.0001, digits: 5 },
  { id: "NZDUSD", yahoo: "NZDUSD=X", name: "Kiwi", kind: "fx", book: "forex", pip: 0.0001, digits: 5 },
  { id: "EURJPY", yahoo: "EURJPY=X", name: "Euro / Yen", kind: "fx", book: "forex", pip: 0.01, digits: 3 },
  { id: "GBPJPY", yahoo: "GBPJPY=X", name: "Sterling / Yen", kind: "fx", book: "forex", pip: 0.01, digits: 3 },
  { id: "EURGBP", yahoo: "EURGBP=X", name: "Euro / Sterling", kind: "fx", book: "forex", pip: 0.0001, digits: 5 },
  { id: "XAUUSD", yahoo: "GC=F", name: "Gold", kind: "metal", book: "forex", pip: 0.1, digits: 2 },
  { id: "MNQ", yahoo: "MNQ=F", name: "Micro Nasdaq", kind: "future", book: "futures", pip: 0.25, digits: 2, wb: "MNQ" },
  { id: "MES", yahoo: "MES=F", name: "Micro S&P 500", kind: "future", book: "futures", pip: 0.25, digits: 2, wb: "MES" },
  { id: "MGC", yahoo: "MGC=F", name: "Micro Gold", kind: "future", book: "futures", pip: 0.1, digits: 1, wb: "MGC" },
  { id: "PL", yahoo: "PL=F", name: "Platinum", kind: "future", book: "futures", pip: 0.1, digits: 1, wb: "PL" },
  { id: "NQ", yahoo: "NQ=F", name: "E-mini Nasdaq", kind: "future", book: "futures", pip: 0.25, digits: 2, wb: "NQ" },
  { id: "ES", yahoo: "ES=F", name: "E-mini S&P 500", kind: "future", book: "futures", pip: 0.25, digits: 2, wb: "ES" },
  { id: "GC", yahoo: "GC=F", name: "Gold 100oz", kind: "future", book: "futures", pip: 0.1, digits: 1, wb: "GC" },
];

export const FOREX_TABS = ["BTCUSD", "ETHUSD", "XAUUSD", "EURUSD", "NAS100", "US30"];
export const FUTURES_TABS = ["MNQ", "MES", "MGC", "PL", "NQ", "ES", "GC"];

export const BASE: Record<string, number> = {
  BTCUSD: 64250,
  ETHUSD: 3480,
  NAS100: 19680,
  US30: 41520,
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
  MNQ: 19680,
  MES: 5620,
  MGC: 2518.4,
  PL: 980,
  NQ: 19680,
  ES: 5620,
  GC: 2518.4,
};

export function marketsFor(book: Book) {
  return UNIVERSE.filter((m) => m.book === book);
}

export function marketById(id: string): Market {
  const m = UNIVERSE.find((x) => x.id === id);
  if (!m) throw new Error("unknown market " + id);
  return m;
}

export function fmt(meta: Market, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return Number(v).toFixed(meta.digits);
}