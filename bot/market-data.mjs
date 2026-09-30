export async function loadYahoo(meta, tf) {
  const interval = tf <= 1 ? "1m" : tf <= 5 ? "5m" : tf <= 15 ? "15m" : tf <= 30 ? "30m" : "1h";
  const range = tf <= 1 ? "1d" : tf <= 5 ? "5d" : tf <= 30 ? "30d" : "60d";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.yahoo)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (compatible; JustxCrystalBot/1.0)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error("Yahoo returned no chart result");
  const q = r.indicators?.quote?.[0];
  if (!q) throw new Error("Yahoo returned no quote data");
  const out = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if (q.open[i] == null || q.high[i] == null || q.low[i] == null || q.close[i] == null) continue;
    out.push({
      t: r.timestamp[i] * 1000,
      o: q.open[i],
      h: q.high[i],
      l: q.low[i],
      c: q.close[i],
      v: q.volume?.[i] ?? 0,
    });
  }
  if (out.length < 40) throw new Error(`Only ${out.length} live candles returned`);
  return out.slice(-180);
}
