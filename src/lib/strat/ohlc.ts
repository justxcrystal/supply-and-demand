import { createServerFn } from "@tanstack/react-start";
import { loadYahoo, synthesize } from "./feed";
import { marketById } from "./universe";
import type { Candle } from "./types";

export const fetchOhlc = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as { id: string; tf: number };
    if (!o?.id || typeof o.tf !== "number") throw new Error("bad ohlc request");
    return { id: o.id, tf: o.tf };
  })
  .handler(async ({ data }): Promise<{ candles: Candle[]; live: boolean }> => {
    const meta = marketById(data.id);
    try {
      const candles = await loadYahoo(meta, data.tf);
      if (candles.length > 40) return { candles, live: true };
    } catch {
      /* sim fallback */
    }
    return { candles: synthesize(meta, data.tf), live: false };
  });
