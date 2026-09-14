import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center bg-transparent p-6 text-fg">
      <div className="hud-panel w-full max-w-sm space-y-4 p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-entry/70">Helix · S&D · AMD</p>
        <h1 className="font-display text-xl font-semibold uppercase tracking-[0.12em]">Sign in</h1>
        <p className="font-mono text-[11px] text-muted">
          Broker backend is locked. Sign in, then submit an access ticket.
        </p>
        {authEnabled ? (
          GROK_PROVIDERS.map((p) => (
            <button
              key={p.providerId}
              type="button"
              onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              className="hud-chip h-11 w-full bg-entry font-mono text-xs font-semibold uppercase tracking-wider text-logo-fg"
            >
              Continue with {p.label}
            </button>
          ))
        ) : (
          <p className="font-mono text-sm text-muted">Sign-in is disabled.</p>
        )}
        <Link to="/" className="block text-center font-mono text-[11px] uppercase tracking-wider text-muted">
          Back to desk
        </Link>
      </div>
    </main>
  );
}
