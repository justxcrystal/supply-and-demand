import { useEffect, useState, type ReactNode } from "react";
import { useWb } from "@/lib/wb-store";
import { wbEquity, type WbEnv } from "@/lib/webull";
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

export function WebullRuntime() {
  const session = useWb((s) => s.session);
  const hydrate = useWb((s) => s.hydrate);
  const refresh = useWb((s) => s.refresh);
  const refreshTrades = useWb((s) => s.refreshTrades);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!session) return;
    void refresh();
    void refreshTrades();
    const t = window.setInterval(() => {
      void refresh();
      void refreshTrades();
    }, 12000);
    return () => window.clearInterval(t);
  }, [session?.token, refresh, refreshTrades]);

  return null;
}

export function WebullPanel() {
  const open = useWb((s) => s.open);
  const setOpen = useWb((s) => s.setOpen);
  const busy = useWb((s) => s.busy);
  const error = useWb((s) => s.error);
  const session = useWb((s) => s.session);
  const login = useWb((s) => s.login);
  const logout = useWb((s) => s.logout);
  const openTrades = useWb((s) => s.openTrades);
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [env, setEnv] = useState<WbEnv>("paper");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end bg-bg/70 p-4 pt-20" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-sm rounded-xl border border-line bg-panel p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">Webull futures</h2>
          <button type="button" className="font-mono text-xs text-muted" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>

        {session ? (
          <div className="space-y-3">
            <p className="font-mono text-xs text-muted">
              {session.env} · {session.accounts.length} account{session.accounts.length === 1 ? "" : "s"}
            </p>
            <div className="max-h-56 space-y-1 overflow-auto">
              {session.accounts.map((a) => {
                const isLead = a.id === session.accountId;
                const eq = wbEquity(a);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => useWb.getState().pickAccount(a.id)}
                    className={cn(
                      "flex h-12 w-full items-center rounded-lg px-3 text-left font-mono text-[11px]",
                      isLead ? "bg-buy-bg text-buy" : "bg-panel2 text-muted",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="block truncate">
                        {a.label}
                        {isLead ? " · LEAD" : ""}
                      </span>
                      <span className="block text-[10px] opacity-80">
                        {eq != null ? money(eq, a.currency) : "—"}
                        {a.buyingPower != null ? ` · bp ${money(a.buyingPower, a.currency)}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
              Open trades · {openTrades.length}
            </p>
            {openTrades.length === 0 ? (
              <p className="font-mono text-[11px] text-muted">None on this login.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-auto">
                {openTrades.map((t) => (
                  <div key={`${t.accountId}-${t.id}`} className="flex justify-between gap-2 rounded-lg bg-panel2 px-3 py-2 font-mono text-[11px]">
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
            <button
              type="button"
              onClick={logout}
              className="h-10 w-full rounded-lg border border-line font-mono text-[11px] text-muted"
            >
              Disconnect
            </button>
            <p className="font-mono text-[10px] text-muted">
              Paper = sandbox. Live needs OpenAPI keys from Webull. Keys stay in this tab.
            </p>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void login({ appKey, appSecret, env });
            }}
          >
            <Field label="App key">
              <input required value={appKey} onChange={(e) => setAppKey(e.target.value)} className={fieldClass} autoComplete="off" />
            </Field>
            <Field label="App secret">
              <input
                required
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                className={fieldClass}
                autoComplete="off"
              />
            </Field>
            <div className="flex gap-2">
              {(["paper", "live"] as const).map((v) => (
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
              Webull OpenAPI → App Management → Generate Key. Paper is the sandbox (no 2FA). Live may ask you to approve in the
              Webull app.
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
