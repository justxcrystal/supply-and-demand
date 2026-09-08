import { useState } from "react";
import { askAmd } from "@/lib/grok";
import { fmt, marketById } from "@/lib/strat/universe";
import type { Analysis, Candle } from "@/lib/strat/types";

function tfLabel(tf: number) {
  if (tf < 60) return `${tf}M`;
  return `${tf / 60}H`;
}

export function GrokPanel({
  symbol,
  tf,
  last,
  analysis,
}: {
  symbol: string;
  tf: number;
  last?: Candle;
  analysis?: Analysis;
}) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function snapshot() {
    const meta = marketById(symbol);
    const s = analysis?.setup;
    return [
      `${meta.id} ${tfLabel(tf)} last ${last ? fmt(meta, last.c) : "—"}`,
      `trend ${analysis?.bias ?? "n/a"} · phase ${analysis?.amd?.phase ?? "n/a"} · mss ${analysis?.amd?.mss ? "yes" : "no"}`,
      `signal ${analysis?.signal ?? "WAIT"} · executable ${analysis?.executable ? "yes" : "no"}`,
      s
        ? `setup ${s.signal} ${s.type} entry ${fmt(meta, s.entry)} sl ${fmt(meta, s.sl)} q ${s.score} taps ${s.touches}`
        : "no setup",
      `issues: ${(analysis?.issues ?? []).map((i) => i.title).join("; ") || "none"}`,
      "rule: only trade distribution retest with the 20/50 trend; trail BE at TP2 then two TPs back; auto TP6",
    ].join("\n");
  }

  return (
    <section className="hud-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Grok</p>
        <button
          type="button"
          disabled={busy || !last}
          onClick={() => {
            setBusy(true);
            setError("");
            askAmd({ data: { snapshot: snapshot() } })
              .then((r) => {
                if (r.ok) setText(r.text);
                else setError(r.error);
              })
              .finally(() => setBusy(false));
          }}
          className="hud-chip h-8 bg-entry px-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-logo-fg"
        >
          {busy ? "…" : "Ask Grok"}
        </button>
      </div>
      {error ? <p className="mt-2 font-mono text-[11px] text-sell">{error}</p> : null}
      {text ? (
        <p className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-muted">{text}</p>
      ) : (
        <p className="mt-2 font-mono text-[11px] text-muted">Press Ask Grok for a live AMD read. Does not place orders.</p>
      )}
    </section>
  );
}
