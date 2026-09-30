export const UNIVERSE = [
  { id: "BTCUSD", yahoo: "BTC-USD", kind: "crypto" },
  { id: "ETHUSD", yahoo: "ETH-USD", kind: "crypto" },
  { id: "NAS100", yahoo: "NQ=F", kind: "index" },
  { id: "US30", yahoo: "YM=F", kind: "index" },
  { id: "EURUSD", yahoo: "EURUSD=X", kind: "fx" },
  { id: "GBPUSD", yahoo: "GBPUSD=X", kind: "fx" },
  { id: "USDJPY", yahoo: "USDJPY=X", kind: "fx" },
  { id: "AUDUSD", yahoo: "AUDUSD=X", kind: "fx" },
  { id: "USDCAD", yahoo: "USDCAD=X", kind: "fx" },
  { id: "USDCHF", yahoo: "USDCHF=X", kind: "fx" },
  { id: "NZDUSD", yahoo: "NZDUSD=X", kind: "fx" },
  { id: "EURJPY", yahoo: "EURJPY=X", kind: "fx" },
  { id: "GBPJPY", yahoo: "GBPJPY=X", kind: "fx" },
  { id: "EURGBP", yahoo: "EURGBP=X", kind: "fx" },
  { id: "XAUUSD", yahoo: "GC=F", kind: "metal" },
];

export function marketById(id) {
  const m = UNIVERSE.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown market ${id}`);
  return m;
}
