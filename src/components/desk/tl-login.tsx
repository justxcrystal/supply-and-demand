import { useEffect, useState, type ReactNode } from "react";
import { useTl } from "@/lib/tl-store";
import type { TlEnv } from "@/lib/tradelocker";
import { cn } from "@/lib/utils";

export function TradeLockerButton() {
  const session = useTl((s) => s.session);
  const setOpen = useTl((s) => s.setOpen);
  const open = useTl((s) => s.open);
  const logout = useTl((s) => s.logout);
  const hydrate = useTl((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (session) {
    const acc = session.accounts.find((a) => a.accNum === session.accNum) ?? session.accounts[0];
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="hud-chip h-10 border border-buy-line bg-buy-bg px-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-buy"
        >
          TL {session.env.toUpperCase()}
          {acc ? ` · ${acc.id}` : ""}
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [env, setEnv] = useState<TlEnv>("demo");

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
            <div className="max-h-48 space-y-1 overflow-auto">
              {session.accounts.map((a) => {
                const on = session.copyIds.includes(a.accNum);
                return (
                  <button
                    key={a.accNum}
                    type="button"
                    onClick={() => useTl.getState().toggleCopy(a.accNum)}
                    className={cn(
                      "flex h-10 w-full items-center justify-between rounded-lg px-3 font-mono text-[11px]",
                      on ? "bg-buy-bg text-buy" : "bg-panel2 text-muted",
                    )}
                  >
                    <span>
                      {a.id} · {a.currency}
                    </span>
                    <span>{on ? "COPY" : "off"}</span>
                  </button>
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
            <p className="font-mono text-[10px] text-muted">
              Tap accounts to include in the copy group. BUY/SELL clones the ticket to every selected account. Turn on
              Send to TradeLocker to fire live market orders with SL.
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
              {(["demo", "live"] as const).map((v) => (
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
              Uses TradeLocker Public API JWT. Demo = demo.tradelocker.com, Live = live.tradelocker.com.
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
