import { test } from "node:test";
import { strict as assert } from "node:assert";
import { assertOrderAccepted, selectTradeInstrument } from "./tradelocker-order.ts";

test("selects an exact broker symbol and its TRADE route", () => {
  const result = selectTradeInstrument([
    { name: "XAUUSD", tradableInstrumentId: 42, routes: [{ id: 1, type: "INFO" }, { id: 2, type: "TRADE" }] },
    { name: "XAUUSD.m", tradableInstrumentId: 43, routes: [{ id: 3, type: "TRADE" }] },
  ], "XAUUSD");
  assert.equal(result.instrument.tradableInstrumentId, 42);
  assert.equal(result.routeId, 2);
});

test("only accepts an unambiguous broker suffix", () => {
  assert.equal(selectTradeInstrument([{ name: "EURUSD.m", tradableInstrumentId: 1, routes: [{ id: 2, type: "TRADE" }] }], "EURUSD").routeId, 2);
  assert.throws(() => selectTradeInstrument([
    { name: "EURUSD.m", tradableInstrumentId: 1, routes: [{ id: 2, type: "TRADE" }] },
    { name: "EURUSD.pro", tradableInstrumentId: 3, routes: [{ id: 4, type: "TRADE" }] },
  ], "EURUSD"), /No unique/);
  assert.throws(() => selectTradeInstrument([{ name: "EURUSD", tradableInstrumentId: 1, routes: [{ id: 2, type: "INFO" }] }], "EURUSD"), /No TRADE route/);
});

test("HTTP success must also carry TradeLocker success", () => {
  assert.doesNotThrow(() => assertOrderAccepted('{"s":"ok","d":{"orderId":123}}'));
  assert.throws(() => assertOrderAccepted('{"s":"error","message":"Market closed"}'), /Market closed/);
  assert.throws(() => assertOrderAccepted("<html>bad gateway</html>"), /unreadable/);
});
