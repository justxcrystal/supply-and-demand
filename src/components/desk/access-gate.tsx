import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { decideTicket, getAccess, listTickets, submitTicket, type AccessStatus } from "@/lib/access";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser, useCurrentUserState } from "@/lib/auth/use-current-user";

export function useDeskAccess() {
  const { user, isPending } = useCurrentUserState();
  const [status, setStatus] = useState<AccessStatus>("none");
  const [canReview, setCanReview] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = async () => {
    if (!user) {
      setStatus("none");
      setCanReview(false);
      return;
    }
    try {
      const r = await getAccess();
      setStatus(r.status);
      setCanReview(r.canReview);
    } catch {
      setStatus("none");
      setCanReview(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [user?.id]);

  return { user, isPending, status, canReview, open, setOpen, refresh, approved: status === "approved" };
}

export function AccessChip({
  access,
}: {
  access: ReturnType<typeof useDeskAccess>;
}) {
  if (access.isPending) return null;
  if (!access.user) {
    return (
      <Link
        to="/login"
        className="hud-chip h-10 px-4 font-mono text-xs font-semibold uppercase tracking-wider border border-line bg-panel2 text-muted"
      >
        Sign in
      </Link>
    );
  }
  const label = access.approved ? "Access on" : access.status === "pending" ? "Ticket pending" : "Get access";
  return (
    <button
      type="button"
      onClick={() => access.setOpen(true)}
      className={`hud-chip h-10 px-4 font-mono text-xs font-semibold uppercase tracking-wider ${
        access.approved ? "bg-buy/20 text-buy" : "border border-line bg-panel2 text-muted"
      }`}
    >
      {label}
    </button>
  );
}

export function AccessPanel({ access }: { access: ReturnType<typeof useDeskAccess> }) {
  const user = useCurrentUser();
  const [name, setName] = useState(user?.displayName ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tickets, setTickets] = useState<Array<{ user_id: string; name: string; note: string; status: string }>>([]);

  useEffect(() => {
    if (!access.open || !access.canReview) return;
    void listTickets()
      .then(setTickets)
      .catch(() => setTickets([]));
  }, [access.open, access.canReview]);

  if (!access.open) return null;

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      await submitTicket({ data: { name, note } });
      await access.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ticket failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => access.setOpen(false)}>
      <div className="hud-panel w-full max-w-md space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Backend lock</p>
            <h2 className="font-display text-lg uppercase tracking-wide">Access ticket</h2>
          </div>
          <button type="button" className="font-mono text-[11px] text-muted" onClick={() => access.setOpen(false)}>
            Close
          </button>
        </div>
        <UserButton />
        {!user ? (
          <>
            <p className="font-mono text-[12px] text-muted">Sign in, then submit a ticket. Broker APIs stay closed until approved.</p>
            <Link
              to="/login"
              className="hud-chip flex h-11 w-full items-center justify-center bg-entry font-mono text-xs font-semibold uppercase tracking-wider text-logo-fg"
            >
              Sign in
            </Link>
          </>
        ) : access.approved ? (
          <p className="font-mono text-[12px] text-buy">Approved. Broker login is unlocked.</p>
        ) : access.status === "pending" ? (
          <p className="font-mono text-[12px] text-muted">Ticket submitted. Wait for approval before TradeLocker / Webull.</p>
        ) : (
          <>
            <p className="font-mono text-[12px] text-muted">
              Nobody hits the broker APIs until a ticket is approved. First signed-in user is owner.
            </p>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-muted">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-line bg-panel2 px-2.5 font-mono text-sm"
              />
            </label>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-muted">
              Why you need the desk
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-line bg-panel2 px-2.5 py-2 font-mono text-sm"
              />
            </label>
            {err ? <p className="font-mono text-[11px] text-flatten">{err}</p> : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="hud-chip h-11 w-full bg-entry font-mono text-xs font-semibold uppercase tracking-wider text-logo-fg"
            >
              {busy ? "Sending…" : "Submit ticket"}
            </button>
          </>
        )}
        {access.canReview && tickets.length ? (
          <div className="space-y-2 border-t border-line pt-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Review</p>
            {tickets.map((t) => (
              <div key={t.user_id} className="flex items-start justify-between gap-2 font-mono text-[11px]">
                <div>
                  <p className="text-fg">{t.name || t.user_id.slice(0, 8)}</p>
                  <p className="text-muted">{t.status} · {t.note || "—"}</p>
                </div>
                {t.status === "pending" ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="text-buy"
                      onClick={() =>
                        void decideTicket({ data: { userId: t.user_id, status: "approved" } }).then(() =>
                          listTickets().then(setTickets),
                        )
                      }
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="text-flatten"
                      onClick={() =>
                        void decideTicket({ data: { userId: t.user_id, status: "denied" } }).then(() =>
                          listTickets().then(setTickets),
                        )
                      }
                    >
                      No
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
