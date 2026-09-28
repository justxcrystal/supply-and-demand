export type OrderInstrument = {
  tradableInstrumentId: number;
  name: string;
  routes?: Array<{ id: number; type: string }>;
};

export function selectTradeInstrument(instruments: OrderInstrument[], symbol: string): { instrument: OrderInstrument; routeId: number } {
  const normalize = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const want = normalize(symbol);
  const matches = instruments.map((instrument) => ({ instrument, name: normalize(instrument.name) }));
  const exact = matches.find((item) => item.name === want);
  const suffixed = matches.filter((item) => item.name.startsWith(want));
  const instrument = exact?.instrument ?? (suffixed.length === 1 ? suffixed[0].instrument : undefined);
  if (!instrument) throw new Error(`No unique TradeLocker instrument for ${symbol}; check the broker symbol`);
  const route = instrument.routes?.find((item) => item.type === "TRADE");
  if (!route) throw new Error(`No TRADE route for ${instrument.name}`);
  return { instrument, routeId: route.id };
}

export function assertOrderAccepted(text: string): void {
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("TradeLocker returned an unreadable order response");
  }
  if (result.s !== "ok") throw new Error(String(result.message ?? result.error ?? result.s ?? "Order was not accepted"));
}
