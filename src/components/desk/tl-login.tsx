import { useEffect, useState, type ReactNode } from "react";
import { useTl } from "@/lib/tl-store";
import { accountEquity, type TlEnv } from "@/lib/tradelocker";
import { cn } from "@/lib/utils";

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

export function TradeLockerButton() {
  const session = useTl((s) => s.session);
  const setOpen = useTl((s) => s.setOpen);
  const open = useTl((s) => s.open);
  const logout = useTl((s) => s.logout);
  const hydrate = useTl((s) => s.hydrate);
  const refreshMoney = useTl((s) => s.refreshMoney);
  const refreshTrades = useTl((s) => s.refreshTrades);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!session) return;
    void refreshMoney();
    void refreshTrades();
    const t = window.setInterval(() => {
      void refreshMoney();
      void refreshTrades();
    }, 12000);
    return () => window.clearInterval(t);
  }, [session?.accessToken, refreshMoney, refreshTrades]);

  if (session) {
    const acc = session.accounts.find((a) => a.accNum === session.accNum) ?? session.accounts[0];
    const eq = accountEquity(acc);
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="hud-chip h-10 border border-buy-line bg-buy-bg px-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-buy"
        >
          TL {session.env.toUpperCase()}
          {eq != null ? ` · ${money(eq, acc?.currency)}` : acc ? ` · ${acc.id}` : ""}
        </button>
        <button
          type="button"
          onClick={logout}
          className="hud-chip h-10 border border-line bg-panel2 px-3 font-mono text-[11px] uppercase tracking-wider text-muted"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="hud-chip h-10 border border-line bg-panel2 px-3 font-mono text-xs font-semibold uppercase tracking-wider"
    >
      TradeLocker login
    </button>
  );
}

export function TradeLockerPanel() {
  const open = useTl((s) => s.open);
  const setOpen = useTl((s) => s.setOpen);
  const busy = useTl((s) => s.busy);
  const error = useTl((s) => s.error);
  const session = useTl((s) => s.session);
  const login = useTl((s) => s.login);
  const openTrades = useTl((s) => s.openTrades);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [env, setEnv] = useState<TlEnv>("broker");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end bg-bg/70 p-4 pt-20" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-sm rounded-xl border border-line bg-panel p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">TradeLocker</h2>
          <button type="button" className="font-mono text-xs text-muted" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>

        {session ? (
          <div className="space-y-3">
            <p className="font-mono text-xs text-muted">
              {session.email} · {session.server} · {session.env}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
              Copy group · {session.copyIds.length} selected
            </p>
            <div className="max-h-56 space-y-1 overflow-auto">
              {session.accounts.map((a) => {
                const on = session.copyIds.includes(a.accNum);
                const isLead = a.accNum === session.accNum;
                const eq = accountEquity(a);
                return (
                  <div
                    key={a.accNum}
                    className={cn(
                      "flex h-12 w-full items-center gap-1 rounded-lg font-mono text-[11px]",
                      isLead ? "bg-buy-bg text-buy" : on ? "bg-entry/10 text-entry" : "bg-panel2 text-muted",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => useTl.getState().pickAccount(a.accNum)}
                      className="min-w-0 flex-1 px-3 text-left"
                    >
                      <span className="block truncate">
                        {a.id} · {a.currency}
                        {isLead ? " · LEAD" : ""}
                      </span>
                      <span className="block text-[10px] opacity-80">
                        {eq != null ? money(eq, a.currency) : "—"}
                        {a.available != null ? ` · avail ${money(a.available, a.currency)}` : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => useTl.getState().toggleCopy(a.accNum)}
                      className="h-full px-3 text-[10px] uppercase"
                    >
                      {on ? "COPY" : "off"}
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => useTl.getState().setCopyAll(session.copyIds.length < session.accounts.length)}
              className="h-10 w-full rounded-lg border border-line font-mono text-[11px] text-muted"
            >
              {session.copyIds.length < session.accounts.length ? "Select all" : "Lead only"}
            </button>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
              Open trades · {openTrades.length}
            </p>
            {openTrades.length === 0 ? (
              <p className="font-mono text-[11px] text-muted">None on this login.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-auto">
                {openTrades.map((t) => (
                  <div key={`${t.accNum}-${t.id}`} className="flex justify-between gap-2 rounded-lg bg-panel2 px-3 py-2 font-mono text-[11px]">
                    <span className="truncate">
                      {t.side} {t.symbol} · {t.qty}
                    </span>
                    <span className={t.pnl == null ? "text-muted" : t.pnl >= 0 ? "text-buy" : "text-sell"}>
                      {t.pnl == null ? "—" : money(t.pnl, t.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="font-mono text-[10px] text-muted">
              Equity is live from TradeLocker account state (projected balance). Tap an account to make it the lead
              number on the desk. BUY/SELL clones the ticket to every COPY account.
            </p>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void login({ email, password, server, env });
            }}
          >
            <Field label="Email">
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Server">
              <input
                required
                placeholder="Same name as TradeLocker web login"
                value={server}
                onChange={(e) => setServer(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <div className="flex gap-2">
              {(["broker", "live"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setEnv(v)}
                  className={cn(
                    "h-10 flex-1 rounded-lg border font-mono text-xs uppercase",
                    env === v ? "border-buy-line bg-buy-bg text-buy" : "border-line bg-panel2 text-muted",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            {error ? <p className="font-mono text-xs text-sell">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="h-11 w-full rounded-lg border border-buy-line bg-buy-bg font-mono text-xs font-semibold text-buy"
            >
              {busy ? "Connecting…" : "Log in"}
            </button>
            <p className="font-mono text-[10px] text-muted">
              Same login as TradeLocker web. Broker is your personal broker account. Live is live.tradelocker.com.
            </p>
          </form>
        )}
      </div>
    </div>
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
