import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMarket, rTargets } from "./strategy.mjs";

test("rTargets builds 1R through 6R", () => {
  assert.deepEqual(rTargets(100, 95, "BUY"), [105, 110, 115, 120, 125, 130]);
  assert.deepEqual(rTargets(100, 105, "SELL"), [95, 90, 85, 80, 75, 70]);
});

test("analyzeMarket waits when there are too few candles", () => {
  const candles = Array.from({ length: 20 }, (_, i) => ({ t: i, o: 100, h: 101, l: 99, c: 100, v: 1 }));
  const analysis = analyzeMarket(candles);
  assert.equal(analysis.signal, "WAIT");
  assert.equal(analysis.executable, false);
});
