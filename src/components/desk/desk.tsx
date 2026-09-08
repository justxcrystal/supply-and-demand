import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CatchCard } from "@/components/desk/catch-card";
import { PriceChart, toHeikin } from "@/components/desk/chart";
import { GrokPanel } from "@/components/desk/grok-panel";
import { TradeLockerPanel, TradeLockerRuntime } from "@/components/desk/tl-login";
import { WebullPanel, WebullRuntime } from "@/components/desk/wb-login";
import {
  CRYPTO_UNLOCK,
  bookEquity,
  cryptoLocked,
  mark,
  marketAllowed,
  nySession,
  useDesk,
} from "@/lib/desk-store";
import { sessionEquity, sessionLead, useTl } from "@/lib/tl-store";
import { accountEquity } from "@/lib/tradelocker";
import { wbLead, wbSessionEquity, useWb } from "@/lib/wb-store";
import { wbEquity } from "@/lib/webull";
import { cn } from "@/lib/utils";
import { FOREX_TABS, FUTURES_TABS, fmt, marketById, marketsFor } from "@/lib/strat/universe";
import type { Analysis, Candle, TpKey } from "@/lib/strat/types";

function haBias(candles: Candle[]): "bull" | "bear" | "neutral" {
  const t = toHeikin(candles);
  const last = t.at(-1);
  if (!last) return "neutral";
  let run = 0;
  for (let i = t.length - 1; i >= 0 && run < 8; i--) {
    const up = t[i].c >= t[i].o;
    if (i < t.length - 1 && up !== t[i + 1].c >= t[i + 1].o) break;
    run++;
  }
  if (run < 2) return "neutral";
  return last.c >= last.o ? "bull" : "bear";
}

function sessionClocks() {
  const wrap = (id: string, label: string, tz: string, start: number, end: number, window: string, zone: string) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
      timeZoneName: "short",
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    const mins = hour * 60 + minute;
    const weekday = get("weekday");
    const closed = weekday === "Sat" || weekday === "Sun";
    const inWin = start <= end ? mins >= start && mins < end : mins >= start || mins < end;
    return {
      id,
      label,
      clock: `${get("hour")}:${get("minute")}`,
      zone: get("timeZoneName") || zone,
      window,
      open: !closed && inWin,
    };
  };
  return [
    wrap("asia", "ASIA", "Asia/Tokyo", 540, 1080, "09:00–18:00", "JST"),
    wrap("london", "LONDON", "Europe/London", 480, 990, "08:00–16:30", "LT"),
    wrap("ny", "NEW YORK", "America/New_York", 480, 1020, "08:00–17:00", "ET"),
  ];
}

export function Desk() {
  const symbol = useDesk((s) => s.symbol);
  const tf = useDesk((s) => s.tf);
  const risk = useDesk((s) => s.risk);
  const candles = useDesk((s) => s.candles);
  const analysis = useDesk((s) => s.analysis);
  const backtests = useDesk((s) => s.backtests);
  const scanning = useDesk((s) => s.scanning);
  const feedLabel = useDesk((s) => s.feedLabel);
  const positions = useDesk((s) => s.positions);
  const closed = useDesk((s) => s.closed);
  const armed = useDesk((s) => s.armed);
  const sendTl = useDesk((s) => s.sendTl);
  const autoTp = useDesk((s) => s.autoTp);
  const trailOn = useDesk((s) => s.trailOn);
  const ha = useDesk((s) => s.ha);
  const flattenAtClose = useDesk((s) => s.flattenAtClose);
  const skin = useDesk((s) => s.skin);
  const challenge = useDesk((s) => s.challenge);
  const book = useDesk((s) => s.book);
  const sendWb = useDesk((s) => s.sendWb);
  const setSymbol = useDesk((s) => s.setSymbol);
  const setTf = useDesk((s) => s.setTf);
  const setRisk = useDesk((s) => s.setRisk);
  const scanAll = useDesk((s) => s.scanAll);
  const tickSim = useDesk((s) => s.tickSim);
  const paper = useDesk((s) => s.paper);
  const flatten = useDesk((s) => s.flatten);
  const closePosition = useDesk((s) => s.closePosition);
  const toggleArmed = useDesk((s) => s.toggleArmed);
  const toggleSendTl = useDesk((s) => s.toggleSendTl);
  const setAutoTp = useDesk((s) => s.setAutoTp);
  const toggleTrail = useDesk((s) => s.toggleTrail);
  const toggleHa = useDesk((s) => s.toggleHa);
  const toggleFlattenAtClose = useDesk((s) => s.toggleFlattenAtClose);
  const toggleSkin = useDesk((s) => s.toggleSkin);
  const toggleChallenge = useDesk((s) => s.toggleChallenge);
  const resetChallenge = useDesk((s) => s.resetChallenge);
  const setBook = useDesk((s) => s.setBook);
  const toggleSendWb = useDesk((s) => s.toggleSendWb);
  const tl = useTl((s) => s.session);
  const lastCopyTl = useTl((s) => s.lastCopy);
  const openTradesTl = useTl((s) => s.openTrades);
  const wb = useWb((s) => s.session);
  const lastCopyWb = useWb((s) => s.lastCopy);
  const openTradesWb = useWb((s) => s.openTrades);
  const [clock, setClock] = useState("");
  const [sessionLeft, setSessionLeft] = useState("");
  const [sessions, setSessions] = useState(sessionClocks);

  useEffect(() => {
    document.documentElement.dataset.skin = skin === "gamer" ? "gamer" : "";
    if (skin !== "gamer") document.documentElement.removeAttribute("data-skin");
  }, [skin]);

  useEffect(() => {
    void scanAll();
  }, [scanAll]);

  useEffect(() => {
    const a = setInterval(tickSim, 2500);
    const b = setInterval(() => {
      setClock(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      setSessionLeft(nyCloseCountdown());
      setSessions(sessionClocks());
    }, 1000);
    setClock(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    setSessionLeft(nyCloseCountdown());
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [tickSim]);

  const meta = marketById(symbol);
  const bars = candles[symbol] ?? [];
  const an = analysis[symbol];
  const last = bars.at(-1);
  const setup = an?.setup;
  const bt = backtests[symbol];
  const paperEq = bookEquity({ challenge, positions, closed, candles });
  const locked = cryptoLocked(challenge, paperEq);
  const allowed = marketAllowed(symbol, challenge, paperEq);
  const canBuy = Boolean(allowed && an?.executable && an.signal === "BUY" && an.bias === "bull");
  const canSell = Boolean(allowed && an?.executable && an.signal === "SELL" && an.bias === "bear");
  const todayPaper = closed
    .filter((t) => t.t.slice(0, 10) === new Date().toISOString().slice(0, 10))
    .reduce((s, t) => s + t.pnl, 0);
  const gatePct = Math.min(100, (Math.max(0, paperEq) / CRYPTO_UNLOCK) * 100);
  const lead = sessionLead(tl);
  const wbAcc = wbLead(wb);
  const tlEq = sessionEquity(tl);
  const wbEq = wbSessionEquity(wb);
  const liveEq = book === "futures" ? wbEq : tlEq;
  const displayEq = liveEq ?? ((book === "futures" ? wb : tl) ? undefined : paperEq);
  const todayAmt =
    book === "futures" ? (wb ? undefined : todayPaper) : (lead?.todayNet ?? (tl ? undefined : todayPaper));
  const ccy = (book === "futures" ? wbAcc?.currency : lead?.currency) ?? "USD";
  const lastCopy = book === "futures" ? lastCopyWb : lastCopyTl;
  const tabs = book === "futures" ? FUTURES_TABS : FOREX_TABS;
  const extra = marketsFor(book).filter((m) => !tabs.includes(m.id));

  const accLabel = useMemo(() => {
    if (book === "futures") {
      if (!wb) return challenge ? "PAPER · $100 · FUTURES" : "PAPER · FUTURES";
      return wbAcc ? `WEBULL ${wb.env.toUpperCase()} · ${wbAcc.label}` : `WEBULL ${wb.env.toUpperCase()}`;
    }
    if (!tl) return challenge ? "PAPER · $100 CHALLENGE" : "PAPER · S&D DESK";
    const env = tl.env.toUpperCase();
    return lead ? `TRADELOCKER ${env} · ${lead.name}` : `TRADELOCKER ${env} · ${tl.server}`;
  }, [book, wb, wbAcc, tl, challenge, lead]);

  return (
    <div className="flex min-h-dvh flex-col bg-transparent text-fg">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="hud-chip grid size-9 place-items-center bg-entry/15 font-display text-xs font-bold tracking-widest text-entry shadow-[var(--shadow-glow)]">
            SD
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-entry/70">Helix · S&D · AMD</p>
            <h1 className="font-display text-lg font-semibold uppercase tracking-[0.12em]">Supply / Demand Desk</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-skin-toggle=""
            aria-label={skin === "gamer" ? "Switch to Command skin" : "Switch to Gamer girl skin"}
            onClick={toggleSkin}
            className={cn(
              "hud-chip h-10 px-4 font-mono text-xs font-semibold uppercase tracking-wider",
              skin === "gamer" ? "bg-entry text-logo-fg" : "border border-line bg-panel2 text-muted",
            )}
          >
            {skin === "gamer" ? "Command" : "Gamer girl"}
          </button>
          {(["forex", "futures"] as const).map((id) => {
            const on = book === id;
            const live = id === "forex" ? tl : wb;
            const eq = id === "forex" ? tlEq : wbEq;
            const ccyChip = id === "forex" ? (lead?.currency ?? "USD") : (wbAcc?.currency ?? "USD");
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (on) {
                    if (id === "forex") useTl.getState().setOpen(true);
                    else useWb.getState().setOpen(true);
                    return;
                  }
                  setBook(id);
                }}
                className={cn(
                  "hud-chip h-10 px-4 font-mono text-xs font-semibold uppercase tracking-wider",
                  on
                    ? live
                      ? "border border-buy-line bg-buy-bg text-buy"
                      : "bg-entry text-logo-fg"
                    : "border border-line bg-panel2 text-muted",
                )}
              >
                {id}
                {live && eq != null ? ` · ${money(eq, ccyChip)}` : live ? " · ON" : ""}
              </button>
            );
          })}
          <button
            type="button"
            data-challenge-toggle=""
            aria-label={challenge ? "Turn off $100 challenge" : "Turn on $100 challenge"}
            onClick={toggleChallenge}
            className={cn(
              "hud-chip h-10 px-4 font-mono text-xs font-semibold uppercase tracking-wider",
              challenge ? "hud-pulse bg-entry text-logo-fg" : "border border-line bg-panel2 text-muted",
            )}
          >
            {challenge ? "$100 on" : "$100 off"}
          </button>
          <span className="hud-chip border border-line bg-panel2 px-3 py-2 font-mono text-[11px] text-muted">
            {flattenAtClose ? "FLAT @ 16:00 ET" : "HOLD"} · {sessionLeft}
          </span>
          <button
            type="button"
            onClick={toggleArmed}
            className={cn(
              "hud-chip h-10 px-4 font-mono text-xs font-semibold uppercase tracking-wider",
              armed ? "hud-pulse bg-entry text-logo-fg" : "border border-line bg-panel2 text-muted",
            )}
          >
            {armed ? "Armed" : "Disarmed"}
          </button>
          <button
            type="button"
            onClick={() => flatten()}
            className="hud-chip h-10 bg-flatten px-4 font-mono text-xs font-semibold uppercase tracking-wider text-flatten-fg"
          >
            Flatten paper
          </button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 px-4 pb-2">
        {sessions.map((s) => (
          <div key={s.id} className={cn("hud-chip px-3 py-2", s.open ? "bg-entry/10" : "bg-panel2")}>
            <p className={cn("font-mono text-[9px] uppercase tracking-[0.22em]", s.open ? "text-entry" : "text-muted")}>
              {s.label} · {s.open ? "OPEN" : "CLOSED"}
            </p>
            <p className="mt-0.5 font-display text-lg tabular-nums leading-none tracking-wide">
              {s.clock} <span className="font-mono text-[10px] text-muted">{s.zone}</span>
            </p>
            <p className="mt-1 font-mono text-[9px] text-muted">{s.window}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-2">
        <Chip active={!tl && !wb}>{tl || wb ? accLabel : challenge ? "$100" : "PAPER"}</Chip>
        {challenge ? (
          <span
            className={cn(
              "hud-chip shrink-0 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider",
              locked ? "bg-flatten/20 text-flatten" : "bg-buy/15 text-buy",
            )}
          >
            {locked ? `Crypto only · unlock $${CRYPTO_UNLOCK}` : "Unlocked · FX · gold · futures"}
          </span>
        ) : null}
        {book === "forex" && tl ? (
          <button
            type="button"
            onClick={() => useTl.getState().setCopyAll(tl.copyIds.length < tl.accounts.length)}
            className={cn(
              "hud-chip h-9 shrink-0 px-3 font-mono text-[10px] uppercase",
              tl.copyIds.length > 1 ? "bg-entry/20 text-entry" : "bg-panel2 text-muted",
            )}
          >
            COPY {tl.copyIds.length}
          </button>
        ) : null}
        {book === "forex"
          ? tl?.accounts.map((a) => {
              const eq = accountEquity(a);
              const isLead = a.accNum === tl.accNum;
              return (
                <button
                  key={a.accNum}
                  type="button"
                  onClick={() => useTl.getState().pickAccount(a.accNum)}
                  className={cn(
                    "hud-chip h-9 shrink-0 px-3 font-mono text-[10px]",
                    isLead ? "bg-entry/20 text-entry" : tl.copyIds.includes(a.accNum) ? "bg-buy/10 text-buy" : "bg-panel2 text-muted",
                  )}
                >
                  {a.id}
                  {eq != null ? ` · ${money(eq, a.currency)}` : ` · ${a.currency}`}
                  {isLead ? " · LEAD" : ""}
                </button>
              );
            })
          : wb?.accounts.map((a) => {
              const eq = wbEquity(a);
              const isLead = a.id === wb.accountId;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => useWb.getState().pickAccount(a.id)}
                  className={cn(
                    "hud-chip h-9 shrink-0 px-3 font-mono text-[10px]",
                    isLead ? "bg-entry/20 text-entry" : "bg-panel2 text-muted",
                  )}
                >
                  {a.label}
                  {eq != null ? ` · ${money(eq, a.currency)}` : ""}
                  {isLead ? " · LEAD" : ""}
                </button>
              );
            })}
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        {tabs.map((id) => {
          const open = marketAllowed(id, challenge, paperEq);
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSymbol(id)}
              className={cn(
                "hud-chip h-9 px-4 font-mono text-xs uppercase tracking-wider",
                symbol === id ? "bg-fg text-bg" : open ? "text-muted hover:text-fg" : "text-muted/50",
              )}
            >
              {id}
              {!open ? " · LOCK" : ""}
            </button>
          );
        })}
        {extra.map((m) => {
          const open = marketAllowed(m.id, challenge, paperEq);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setSymbol(m.id)}
              className={cn(
                "hud-chip h-9 px-3 font-mono text-[11px] uppercase",
                symbol === m.id ? "bg-fg text-bg" : open ? "text-muted" : "text-muted/50",
              )}
            >
              {m.id}
              {!open ? " · LOCK" : ""}
            </button>
          );
        })}
      </div>

      <main className="grid min-h-0 flex-1 gap-3 px-4 pb-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)]">
        <div className="flex min-h-0 flex-col gap-3">
          <section className="hud-panel flex min-h-[420px] flex-1 flex-col p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                  {meta.id} · {tfLabel(tf)} · {ha ? "HEIKIN ASHI" : "CANDLES"} · {feedLabel}
                </p>
                <p className="mt-1 font-mono text-3xl tabular-nums">{last ? fmt(meta, last.c) : "—"}</p>
                <p
                  className={cn(
                    "mt-1 font-mono text-[11px] uppercase tracking-wide",
                    an?.bias === "bear" ? "text-sell" : "text-buy",
                  )}
                >
                  {phaseLine(an)}
                </p>
                <AmdStrip phase={an?.amd?.phase} mss={an?.amd?.mss} ha={haBias(bars)} />
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="font-mono text-[10px] text-buy">
                  {scanning ? "SCANNING" : nySession().open ? "OPEN" : "CLOSED"} · NY {clock}
                </span>
                <div className="flex gap-1">
                  {[1, 5, 15, 30, 60].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTf(v)}
                      className={cn(
                        "hud-chip h-8 min-w-10 px-2 font-mono text-[10px]",
                        tf === v ? "bg-fg text-bg" : "bg-panel2 text-muted",
                      )}
                    >
                      {tfLabel(v)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={toggleHa}
                    className={cn("hud-chip h-8 px-3 font-mono text-[10px]", ha ? "bg-entry text-logo-fg" : "bg-panel2 text-muted")}
                  >
                    HA
                  </button>
                </div>
                <select
                  value={risk}
                  onChange={(e) => setRisk(e.target.value)}
                  className="h-8 rounded-full border border-line bg-panel2 px-2 font-mono text-[10px]"
                >
                  <option value="0.5">Risk 0.5%</option>
                  <option value="1">Risk 1.0%</option>
                  <option value="2">Risk 2.0%</option>
                  <option value="3">Risk 3.0%</option>
                  <option value="5">Risk 5.0%</option>
                  <option value="10">Risk 10%</option>
                  <option value="15">Risk 15%</option>
                </select>
              </div>
            </div>
            <div className="mt-3 min-h-[240px] flex-1 overflow-hidden bg-chart">
              <PriceChart symbol={symbol} candles={bars} analysis={an} ha={ha} />
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted">
              {!allowed
                ? `$100 challenge · crypto only until $${CRYPTO_UNLOCK}. Gold, FX and indices stay locked.`
                : setup
                  ? `${setup.reason} · Q ${setup.score}/99 · TP1–TP6 = 1R–6R`
                  : "AMD: accumulate → manipulate → distribute. Auto only with the trend."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => paper("BUY")}
                disabled={!canBuy}
                className="hud-chip h-10 bg-buy px-4 font-mono text-xs font-semibold uppercase tracking-wider text-logo-fg"
              >
                BUY DEMAND
              </button>
              <button
                type="button"
                onClick={() => paper("SELL")}
                disabled={!canSell}
                className="hud-chip h-10 bg-sell px-4 font-mono text-xs font-semibold uppercase tracking-wider"
              >
                SELL SUPPLY
              </button>
              <button
                type="button"
                onClick={() => void scanAll()}
                className="hud-chip h-10 border border-line px-4 font-mono text-xs uppercase tracking-wider text-muted"
              >
                Scan
              </button>
            </div>
          </section>

          <section className="hud-panel p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Open positions
              {positions.length + (book === "futures" ? openTradesWb.length : openTradesTl.length) > 0
                ? ` · ${positions.length + (book === "futures" ? openTradesWb.length : openTradesTl.length)}`
                : ""}
            </p>
            {positions.length === 0 ? (
              <p className="mt-3 font-mono text-xs text-muted">
                {tl || wb
                  ? "No paper trades."
                  : "Armed · auto with-trend · trail · TP6. Waiting for distribution retest."}
              </p>
            ) : (
              positions.map((p) => {
                const px = candles[p.sym]?.at(-1)?.c ?? p.entry;
                const m = mark(p, px);
                const md = marketById(p.sym);
                return (
                  <div key={p.id} className="mt-3">
                    <div className="flex justify-between font-mono text-sm">
                      <span>
                        {p.side} {p.sym} {p.account !== "PAPER" ? p.account : "S&D"}
                      </span>
                      <span className={m.pnl >= 0 ? "text-buy" : "text-sell"}>
                        {money(m.pnl)} · {m.r >= 0 ? "+" : ""}
                        {m.r.toFixed(2)}R
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-muted">
                      Entry {fmt(md, p.entry)} · SL {fmt(md, p.sl)} {p.trailLabel !== "INIT" ? `(${p.trailLabel})` : ""} · {p.riskPct}%
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {p.tps.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => closePosition(p.id, `tp${i + 1}` as TpKey)}
                          className="hud-chip h-10 bg-panel2 font-mono text-[11px]"
                        >
                          TP{i + 1}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => closePosition(p.id, "mkt")}
                      className="hud-chip mt-2 h-10 w-full bg-flatten font-mono text-[11px] text-flatten-fg"
                    >
                      Flatten
                    </button>
                  </div>
                );
              })
            )}
            {book === "forex" && tl ? (
              <div className="mt-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                  TradeLocker · {openTradesTl.length} open
                </p>
                {openTradesTl.length === 0 ? (
                  <p className="mt-2 font-mono text-xs text-muted">No forex trades open.</p>
                ) : (
                  <div className="mt-2 max-h-64 space-y-2 overflow-auto">
                    {openTradesTl.map((t) => (
                      <div key={`${t.accNum}-${t.id}`} className="rounded-2xl bg-panel2 p-3">
                        <div className="flex justify-between gap-2 font-mono text-sm">
                          <span>
                            {t.side} {t.symbol}
                          </span>
                          <span className={t.pnl == null ? "text-muted" : t.pnl >= 0 ? "text-buy" : "text-sell"}>
                            {t.pnl == null ? "—" : money(t.pnl, t.currency)}
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-[10px] text-muted">
                          {t.qty} · avg {t.entry ? t.entry.toLocaleString(undefined, { maximumFractionDigits: 5 }) : "—"} · {t.accountName}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            {book === "futures" && wb ? (
              <div className="mt-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                  Webull · {openTradesWb.length} open
                </p>
                {openTradesWb.length === 0 ? (
                  <p className="mt-2 font-mono text-xs text-muted">No futures trades open.</p>
                ) : (
                  <div className="mt-2 max-h-64 space-y-2 overflow-auto">
                    {openTradesWb.map((t) => (
                      <div key={`${t.accountId}-${t.id}`} className="rounded-2xl bg-panel2 p-3">
                        <div className="flex justify-between gap-2 font-mono text-sm">
                          <span>
                            {t.side} {t.symbol}
                          </span>
                          <span className={t.pnl == null ? "text-muted" : t.pnl >= 0 ? "text-buy" : "text-sell"}>
                            {t.pnl == null ? "—" : money(t.pnl, t.currency)}
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-[10px] text-muted">
                          {t.qty} · avg {t.entry ? t.entry.toLocaleString(undefined, { maximumFractionDigits: 5 }) : "—"} · {t.accountName}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted">Auto-close</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["off", "tp1", "tp2", "tp3", "tp4", "tp5", "tp6"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAutoTp(v)}
                  className={cn(
                    "hud-chip h-9 px-4 font-mono text-[11px] uppercase",
                    autoTp === v ? "bg-entry text-logo-fg" : "bg-panel2 text-muted",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <Toggle
              label="Trail SL"
              hint="BE at TP2. Then two TPs back."
              on={trailOn}
              onChange={toggleTrail}
            />
            <Toggle
              label="Flatten at NY close"
              hint="16:00 ET market. Off = hold overnight."
              on={flattenAtClose}
              onChange={toggleFlattenAtClose}
            />
          </section>
        </div>

        <div className="flex flex-col gap-3">
          <section className="hud-panel p-4">
            <p className="break-words font-mono text-[10px] uppercase tracking-wide text-muted">{accLabel}</p>
            <p className="mt-2 font-display text-5xl tabular-nums tracking-tight" data-tl-equity="">
              {displayEq == null ? "—" : money(displayEq, ccy)}
            </p>
            <p
              className={cn(
                "mt-1 font-mono text-sm",
                (todayAmt ?? todayPaper) >= 0 ? "text-buy" : "text-sell",
              )}
            >
              Today {todayAmt == null ? money(todayPaper) : money(todayAmt, ccy)}
              {book === "forex" && lead?.openPnl != null ? ` · Open ${money(lead.openPnl, ccy)}` : ""}
            </p>
            {book === "forex" && lead?.available != null ? (
              <p className="mt-1 font-mono text-[11px] text-muted">Available {money(lead.available, ccy)}</p>
            ) : null}
            {book === "futures" && wbAcc?.buyingPower != null ? (
              <p className="mt-1 font-mono text-[11px] text-muted">Buying power {money(wbAcc.buyingPower, ccy)}</p>
            ) : null}
            {tl || wb ? (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">
                Paper {money(paperEq)}
                {challenge ? " · $100 book" : " · $25k desk"}
              </p>
            ) : null}
            {challenge ? (
              <div className="mt-3">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted">
                  <span>{locked ? "Crypto gate" : "Gate cleared"}</span>
                  <span>
                    {money(paperEq)} / {money(CRYPTO_UNLOCK)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden bg-panel2">
                  <div
                    className={cn("h-full", locked ? "bg-flatten" : "bg-buy")}
                    style={{ width: `${gatePct}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={resetChallenge}
                  className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted hover:text-fg"
                >
                  Restart $100
                </button>
              </div>
            ) : null}
            <Toggle label="Live execution" hint="Auto BUY/SELL with trend · trail · TP6" on={armed} onChange={toggleArmed} />
            <Toggle
              label={book === "futures" ? "Send to Webull" : "Send to TradeLocker"}
              hint={
                book === "futures"
                  ? wb
                    ? `Copy 1 ${wb.env} futures contract · market`
                    : "Tap FUTURES, log in with Webull OpenAPI keys, then arm send"
                  : tl
                    ? `Copy ${tl.copyIds.length} ${tl.env} account${tl.copyIds.length === 1 ? "" : "s"} · market + SL + TP6`
                    : "Tap FOREX, log into TradeLocker, tap accounts to copy, then arm send"
              }
              on={book === "futures" ? sendWb : sendTl}
              onChange={book === "futures" ? toggleSendWb : toggleSendTl}
            />
            {lastCopy.length > 0 ? (
              <div className="mt-3 space-y-1">
                {lastCopy.map((row) => (
                  <p key={row.acc} className={cn("font-mono text-[10px]", row.ok ? "text-buy" : "text-sell")}>
                    {row.ok ? "COPIED" : "FAIL"} · {row.acc} · {row.msg}
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          <GrokPanel symbol={symbol} tf={tf} last={last} analysis={an} />

          <section className="hud-panel p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">What's wrong</p>
            <div className="mt-2 space-y-2">
              {(an?.issues ?? []).map((iss) => (
                <div key={iss.title} className="rounded-2xl bg-panel2 p-3">
                  <p
                    className={cn(
                      "font-mono text-xs font-semibold",
                      iss.level === "block" && "text-sell",
                      iss.level === "warn" && "text-flatten",
                      iss.level === "info" && "text-entry",
                    )}
                  >
                    {iss.level === "block" ? "BLOCK" : iss.level === "warn" ? "WATCH" : "OK"} · {iss.title}
                  </p>
                  <p className="mt-1 font-mono text-[11px] leading-snug text-muted">{iss.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="hud-panel p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Sample backtest</p>
            <p className="mt-1 font-mono text-[11px] text-muted">
              AMD sample: distribution retest, TP1 = 1R. Target ≥80% hit rate.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="P&L" value={money(bt?.pnl ?? 0)} up={(bt?.pnl ?? 0) >= 0} />
              <Stat label="Net" value={`${(bt?.netR ?? 0) >= 0 ? "+" : ""}${(bt?.netR ?? 0).toFixed(2)}R`} up={(bt?.netR ?? 0) >= 0} />
              <Stat label="Win rate" value={`${(bt?.winRate ?? 0).toFixed(1)}%`} />
              <Stat label="Trades" value={`${bt?.wins ?? 0}W / ${bt?.losses ?? 0}L`} />
              <Stat
                label="Expectancy"
                value={`${(bt?.expectancy ?? 0) >= 0 ? "+" : ""}${(bt?.expectancy ?? 0).toFixed(2)}R`}
              />
              <Stat label="Max DD" value={money(-(bt?.maxDd ?? 0))} up={false} />
            </div>
            <Spark curve={bt?.curve ?? [0]} />
          </section>

          <section className="hud-panel p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Journal</p>
            <div className="mt-2 max-h-48 space-y-2 overflow-auto">
              {closed.length === 0 ? (
                <p className="font-mono text-xs text-muted">No closed trades.</p>
              ) : (
                [...closed]
                  .reverse()
                  .slice(0, 12)
                  .map((t) => (
                    <div key={t.id} className="flex justify-between font-mono text-xs">
                      <span>
                        {t.side} {t.sym} {t.reason}
                      </span>
                      <span className={t.pnl >= 0 ? "text-buy" : "text-sell"}>{money(t.pnl)}</span>
                    </div>
                  ))
              )}
            </div>
            <CatchCard closed={closed} />
          </section>
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 font-mono text-[10px] text-muted">
        <span>
          {challenge
            ? `$100 challenge · crypto only until $${CRYPTO_UNLOCK}. FOREX = TradeLocker. FUTURES = Webull.`
            : "FOREX = TradeLocker. FUTURES = Webull micros/minis. Trail + TP6."}
        </span>
        <span className={skin === "gamer" ? "text-entry" : ""}>@justxcrystal777</span>
      </footer>
      <TradeLockerRuntime />
      <WebullRuntime />
      <TradeLockerPanel />
      <WebullPanel />
    </div>
  );
}

function AmdStrip({ phase, mss, ha }: { phase?: string; mss?: boolean; ha?: string }) {
  const steps = [
    { id: "accumulation", label: "Accum" },
    { id: "manipulation", label: "Manip" },
    { id: "distribution", label: "Dist" },
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {steps.map((s) => (
        <span
          key={s.id}
          className={cn(
            "hud-chip px-2 py-1 font-mono text-[10px] uppercase",
            phase === s.id ? "bg-entry text-logo-fg" : "bg-panel2 text-muted",
          )}
        >
          {s.label}
        </span>
      ))}
      <span className={cn("rounded-full px-2 py-1 font-mono text-[10px]", mss ? "text-buy" : "text-muted")}>
        {mss ? "MSS" : "no sweep"}
      </span>
      <span
        className={cn(
          "rounded-full px-2 py-1 font-mono text-[10px]",
          ha === "bear" ? "text-sell" : ha === "bull" ? "text-buy" : "text-muted",
        )}
      >
        HA {ha === "bear" ? "BEAR" : ha === "bull" ? "BULL" : "FLAT"}
      </span>
    </div>
  );
}

function phaseLine(an: Analysis | undefined) {
  const trend = an?.bias === "bear" ? "BEARISH" : an?.bias === "bull" ? "BULLISH" : "FLAT";
  const dir = an?.bias === "bear" ? "SELL" : an?.bias === "bull" ? "BUY" : "WAIT";
  if (an?.executable) return `OVERALL TREND ${trend} · ${an.signal} · AUTO TP6`;
  return `OVERALL TREND ${trend} · ${dir} · ${an?.amd?.phase?.toUpperCase() ?? "WAIT"}`;
}

function Chip({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "hud-chip shrink-0 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider",
        active ? "bg-entry/15 text-entry" : "bg-panel2 text-muted",
      )}
    >
      {children}
    </span>
  );
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm">{label}</p>
        <p className="font-mono text-[10px] leading-snug text-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onChange}
        className={cn("h-7 w-12 rounded-full p-0.5", on ? "bg-entry" : "bg-panel2")}
      >
        <span className={cn("block size-6 rounded-full bg-fg transition-transform", on ? "translate-x-5" : "translate-x-0")} />
      </button>
    </div>
  );
}

function Stat({ label, value, up }: { label: string; value: string; up?: boolean }) {
  return (
    <div className="rounded-2xl bg-panel2 p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <p className={cn("mt-1 font-mono text-lg tabular-nums", up === true && "text-buy", up === false && "text-sell")}>
        {value}
      </p>
    </div>
  );
}

function Spark({ curve }: { curve: number[] }) {
  if (curve.length < 2) return <div className="mt-3 h-16" />;
  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const span = max - min || 1;
  const w = 280;
  const h = 56;
  const d = curve
    .map((v, i) => {
      const x = (i / (curve.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const up = curve[curve.length - 1] >= curve[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-16 w-full">
      <path d={d} fill="none" stroke={up ? "var(--color-buy)" : "var(--color-sell)"} strokeWidth="2" />
    </svg>
  );
}

function money(n: number, ccy = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy || "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    const sign = n < 0 ? "-" : "";
    return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}

function tfLabel(tf: number) {
  if (tf < 60) return `${tf}M`;
  return `${tf / 60}H`;
}

function nyCloseCountdown() {
  const now = new Date();
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const close = new Date(ny);
  close.setHours(16, 0, 0, 0);
  const day = ny.getDay();
  if (day === 6) close.setDate(close.getDate() + 2);
  else if (day === 0) close.setDate(close.getDate() + 1);
  else if (ny > close) close.setDate(close.getDate() + (day === 5 ? 3 : 1));
  let ms = close.getTime() - ny.getTime();
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}H ${m}M`;
}
