import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CRYPTO_UNLOCK, marketAllowed, startEq, useDesk } from "@/lib/desk-store";
import { rTargets } from "@/lib/strat/targets";
import { fmt, marketById } from "@/lib/strat/universe";
import type { Analysis, Candle } from "@/lib/strat/types";
import { cn } from "@/lib/utils";

function n(v: string) {
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}

export function ManualTicket({
  last,
  analysis,
  paperEq,
}: {
  last?: Candle;
  analysis?: Analysis;
  paperEq: number;
}) {
  const symbol = useDesk((s) => s.symbol);
  const risk = useDesk((s) => s.risk);
  const book = useDesk((s) => s.book);
  const challenge = useDesk((s) => s.challenge);
  const sendTl = useDesk((s) => s.sendTl);
  const sendWb = useDesk((s) => s.sendWb);
  const manual = useDesk((s) => s.manual);

  const meta = marketById(symbol);
  const allowed = marketAllowed(symbol, challenge, paperEq);
  const px = last?.c;
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [qty, setQty] = useState("");
  const [msg, setMsg] = useState("");
  const primed = useRef("");

  useEffect(() => {
    const key = `${symbol}:${book}:${risk}`;
    const first = primed.current !== key;
    if (!first && entry) return;
    primed.current = key;
    const lastPx = last?.c;
    const setup = analysis?.setup;
    const nextSide = setup?.signal === "SELL" ? "SELL" : "BUY";
    const nextEntry = setup && setup.signal === nextSide ? setup.entry : lastPx;
    const nextSl =
      setup && setup.signal === nextSide
        ? setup.sl
        : lastPx
          ? nextSide === "BUY"
            ? lastPx * 0.995
            : lastPx * 1.005
          : undefined;
    setSide(nextSide);
    setEntry(nextEntry != null ? nextEntry.toFixed(meta.digits) : "");
    setSl(nextSl != null ? nextSl.toFixed(meta.digits) : "");
    setQty(book === "futures" ? "1" : String(Math.max(0.01, Math.round(Number(risk) * 100) / 10000)));
    setMsg("");
  }, [symbol, book, risk, meta.digits, last?.c, analysis?.setup, entry]);

  const entryN = n(entry);
  const slN = n(sl);
  const qtyN = n(qty);
  const tps = useMemo(() => {
    if (!Number.isFinite(entryN) || !Number.isFinite(slN)) return [];
    if (side === "BUY" && !(slN < entryN)) return [];
    if (side === "SELL" && !(slN > entryN)) return [];
    return rTargets(entryN, slN, side);
  }, [entryN, slN, side]);
  const rDist = Number.isFinite(entryN) && Number.isFinite(slN) ? Math.abs(entryN - slN) : 0;
  const riskAmt = startEq(challenge) * (Number(risk) / 100);
  const slOk = side === "BUY" ? slN < entryN : slN > entryN;
  const canSend = allowed && last && Number.isFinite(entryN) && Number.isFinite(slN) && slOk && qtyN > 0;

  function send(next: "BUY" | "SELL") {
    if (!canSend || !Number.isFinite(entryN) || !Number.isFinite(slN)) return;
    if (next === "BUY" && !(slN < entryN)) {
      setMsg("BUY stop must be below entry");
      return;
    }
    if (next === "SELL" && !(slN > entryN)) {
      setMsg("SELL stop must be above entry");
      return;
    }
    setSide(next);
    manual({ side: next, entry: entryN, sl: slN, qty: qtyN });
    setMsg(`${next} ${meta.id} sent`);
  }

  function snap() {
    const setup = analysis?.setup;
    const lastPx = last?.c;
    if (setup && (setup.signal === "BUY" || setup.signal === "SELL")) {
      setSide(setup.signal);
      setEntry(setup.entry.toFixed(meta.digits));
      setSl(setup.sl.toFixed(meta.digits));
      setMsg("Snapped to zone");
      return;
    }
    if (lastPx) {
      setEntry(lastPx.toFixed(meta.digits));
      setSl((side === "BUY" ? lastPx * 0.995 : lastPx * 1.005).toFixed(meta.digits));
      setMsg("Snapped to last");
    }
  }

  return (
    <section className="hud-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Manual ticket</p>
        <button
          type="button"
          onClick={snap}
          className="hud-chip h-8 px-3 font-mono text-[10px] uppercase tracking-wider text-muted"
        >
          Snap zone
        </button>
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted">
        {meta.id} · {px != null ? fmt(meta, px) : "—"} · {book === "futures" ? "contracts" : "lots"}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-1">
        {(["BUY", "SELL"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setSide(v)}
            className={cn(
              "h-10 rounded-lg font-mono text-xs font-semibold uppercase tracking-wider",
              side === v ? (v === "BUY" ? "bg-buy text-logo-fg" : "bg-sell") : "bg-panel2 text-muted",
            )}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Entry">
          <input value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" className={fieldClass} />
        </Field>
        <Field label="Stop">
          <input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" className={fieldClass} />
        </Field>
        <Field label={book === "futures" ? "Contracts" : "Lots"}>
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" className={fieldClass} />
        </Field>
        <Field label={`Risk ${risk}%`}>
          <p className="flex h-10 items-center font-mono text-xs tabular-nums">
            ${riskAmt.toFixed(2)}
            {rDist ? ` · ${rDist.toFixed(meta.digits)}` : ""}
          </p>
        </Field>
      </div>
      {tps.length ? (
        <div className="mt-3 grid grid-cols-3 gap-1">
          {tps.map((tp, i) => (
            <p key={i} className="rounded-lg bg-panel2 px-2 py-1.5 font-mono text-[10px] text-muted">
              TP{i + 1} {fmt(meta, tp)}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-3 font-mono text-[11px] text-sell">Stop must sit {side === "BUY" ? "below" : "above"} entry.</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!canSend}
          onClick={() => send("BUY")}
          className="hud-chip h-11 flex-1 bg-buy font-mono text-xs font-semibold uppercase tracking-wider text-logo-fg disabled:opacity-40"
        >
          Buy
        </button>
        <button
          type="button"
          disabled={!canSend}
          onClick={() => send("SELL")}
          className="hud-chip h-11 flex-1 bg-sell font-mono text-xs font-semibold uppercase tracking-wider disabled:opacity-40"
        >
          Sell
        </button>
      </div>
      <p className="mt-2 font-mono text-[10px] text-muted">
        {!allowed
          ? `$100 · crypto only until $${CRYPTO_UNLOCK}`
          : book === "futures"
            ? sendWb
              ? "Sends paper + 1 Webull market if Send is on"
              : "Paper now. Arm Send to Webull for live"
            : sendTl
              ? "Sends paper + TradeLocker market + SL + TP6 if Send is on"
              : "Paper now. Arm Send to TradeLocker for live"}
      </p>
      {msg ? <p className="mt-1 font-mono text-[11px] text-entry">{msg}</p> : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block font-mono text-[10px] uppercase tracking-wider text-muted">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const fieldClass =
  "h-10 w-full rounded-lg border border-line bg-panel2 px-2.5 font-mono text-xs text-fg outline-none focus:border-entry";
