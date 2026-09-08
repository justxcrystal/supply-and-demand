import { useRef, useState } from "react";
import { imagineCatch } from "@/lib/grok";
import { cn } from "@/lib/utils";
import type { ClosedTrade } from "@/lib/strat/types";

type Catch = {
  day: string;
  rows: ClosedTrade[];
  wins: number;
  losses: number;
  pnl: number;
  netR: number;
  best: ClosedTrade | null;
};

function dayCatch(closed: ClosedTrade[], now = new Date()): Catch {
  const day = now.toISOString().slice(0, 10);
  const rows = closed.filter((t) => t.t.slice(0, 10) === day);
  const wins = rows.filter((t) => t.rMult > 0).length;
  return {
    day,
    rows,
    wins,
    losses: rows.length - wins,
    pnl: rows.reduce((s, t) => s + t.pnl, 0),
    netR: rows.reduce((s, t) => s + t.rMult, 0),
    best: [...rows].sort((a, b) => b.rMult - a.rMult)[0] ?? null,
  };
}

function money0(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function caption(c: Catch) {
  const wr = c.rows.length ? Math.round((c.wins / c.rows.length) * 100) : 0;
  const sign = c.netR >= 0 ? "+" : "";
  const trophy = c.best
    ? `Trophy: ${c.best.side} ${c.best.sym} ${c.best.rMult >= 0 ? "+" : ""}${c.best.rMult.toFixed(2)}R · ${c.best.reason}`
    : "No trophy yet.";
  return [
    `S&D desk · ${c.day}`,
    `${c.rows.length} fish · ${c.wins}W/${c.losses}L · ${wr}% · ${sign}${c.netR.toFixed(2)}R`,
    trophy,
    "",
    "AMD distribution only. Trail. Flatten at NY close.",
    "#SupplyAndDemand #AMD",
  ].join("\n");
}

function imaginePrompt(c: Catch) {
  const sign = c.netR >= 0 ? "+" : "";
  const trophy = c.best
    ? `${c.best.side} ${c.best.sym} ${c.best.rMult >= 0 ? "+" : ""}${c.best.rMult.toFixed(2)}R ${c.best.reason}`
    : "empty board";
  const boat = c.rows
    .slice(0, 6)
    .map((t) => `${t.side} ${t.sym} ${t.rMult >= 0 ? "+" : ""}${t.rMult.toFixed(2)}R`)
    .join(", ");
  return [
    "Cinematic 16:9 trophy-fish photograph for a dark trading desk, luxury fintech, not cartoon, not meme.",
    "A massive trophy fish mounted on a black carbon wall with mint HUD edge lighting, like a catch of the day.",
    "Brass plaque under the fish, sharp readable letters:",
    `SUPPLY AND DEMAND  ·  ${c.day}`,
    `THE DAY'S CATCH  ${sign}${c.netR.toFixed(2)}R  ·  ${c.wins}W/${c.losses}L  ·  ${c.rows.length} FISH`,
    `TROPHY: ${trophy}`,
    boat ? `Boat: ${boat}` : "",
    "Background: black trading HUD, faint candlesticks, no people, no logos of other brands, no watermarks.",
    "Photoreal fish, gallery lighting, 16:9 landscape.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function localCard(c: Catch): Promise<Blob> {
  await document.fonts?.ready?.catch(() => undefined);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#04060a";
  ctx.fillRect(0, 0, 1200, 675);
  ctx.strokeStyle = "rgba(94,234,212,0.06)";
  for (let x = 0; x < 1200; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 675);
    ctx.stroke();
  }
  for (let y = 0; y < 675; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1200, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(94,234,212,0.07)";
  ctx.beginPath();
  ctx.arc(980, 120, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(94,234,212,0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, 1144, 619);
  ctx.fillStyle = "#5eead4";
  ctx.font = "600 18px Rajdhani, IBM Plex Mono, sans-serif";
  ctx.fillText("SUPPLY AND DEMAND  ·  THE DAY'S CATCH", 56, 72);
  ctx.fillStyle = "#6f8b86";
  ctx.font = "14px IBM Plex Mono, monospace";
  ctx.fillText(c.day, 56, 98);
  const sign = c.netR >= 0 ? "+" : "";
  ctx.fillStyle = c.netR >= 0 ? "#3ee8a0" : "#ff5d73";
  ctx.font = "700 108px Rajdhani, sans-serif";
  ctx.fillText(`${sign}${c.netR.toFixed(2)}R`, 56, 230);
  ctx.fillStyle = "#d7ece8";
  ctx.font = "22px IBM Plex Mono, monospace";
  ctx.fillText(`${money0(c.pnl)}   ${c.wins} KEPT   ${c.losses} RELEASED   ${c.rows.length} FISH`, 56, 278);
  if (c.best) {
    ctx.fillStyle = "#5eead4";
    ctx.font = "600 16px Rajdhani, sans-serif";
    ctx.fillText("TROPHY FISH", 56, 340);
    ctx.fillStyle = "#d7ece8";
    ctx.font = "700 42px Rajdhani, sans-serif";
    ctx.fillText(`${c.best.side}  ${c.best.sym}`, 56, 392);
    ctx.fillStyle = c.best.rMult >= 0 ? "#3ee8a0" : "#ff5d73";
    ctx.font = "28px IBM Plex Mono, monospace";
    ctx.fillText(`${c.best.rMult >= 0 ? "+" : ""}${c.best.rMult.toFixed(2)}R  ·  ${c.best.reason}`, 56, 436);
  }
  c.rows
    .filter((t) => t.id !== c.best?.id)
    .slice(0, 5)
    .forEach((t, i) => {
      ctx.fillStyle = "#6f8b86";
      ctx.font = "14px IBM Plex Mono, monospace";
      ctx.fillText(
        `${t.side} ${t.sym}  ${t.rMult >= 0 ? "+" : ""}${t.rMult.toFixed(2)}R  ${t.reason}`,
        56,
        500 + i * 26,
      );
    });
  ctx.fillStyle = "rgba(94,234,212,0.7)";
  ctx.font = "14px IBM Plex Mono, monospace";
  ctx.fillText("AMD  ·  DISTRIBUTION ONLY  ·  TRAIL  ·  NY CLOSE", 56, 630);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob failed"))), "image/png");
  });
}

export function CatchCard({ closed }: { closed: ClosedTrade[] }) {
  const catchOf = dayCatch(closed);
  const empty = catchOf.rows.length === 0;
  const [src, setSrc] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const lock = useRef(false);

  async function mount() {
    if (empty || lock.current || src) return src;
    lock.current = true;
    setBusy(true);
    setNote("");
    try {
      const imagined = await imagineCatch({ data: { prompt: imaginePrompt(catchOf) } });
      if (imagined.ok) {
        setSrc(imagined.src);
        return imagined.src;
      }
      const blob = await localCard(catchOf);
      const url = URL.createObjectURL(blob);
      setSrc(url);
      setNote(`${imagined.error} · mounted a local card instead`);
      return url;
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Imagine failed");
      return "";
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function save() {
    const url = src || (await mount());
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `sd-catch-${catchOf.day}.png`;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.click();
  }

  async function postX() {
    const text = caption(catchOf);
    const url = src || (await mount());
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    if (url && navigator.share) {
      try {
        const blob = await fetch(url).then((r) => r.blob());
        const file = new File([blob], `sd-catch-${catchOf.day}.png`, { type: blob.type || "image/png" });
        await navigator.share({ text, files: [file], title: "S&D catch of the day" });
        setNote("Shared. If X didn't open, caption is copied — attach the Imagine card.");
        return;
      } catch {
        /* compose fallback */
      }
    }
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setNote("Caption copied. X compose is open — attach the Imagine trophy.");
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={empty || busy}
          onClick={() => void mount()}
          className="hud-chip h-10 bg-entry px-4 font-mono text-[11px] font-semibold uppercase tracking-wider text-logo-fg"
        >
          {busy ? "Imagining…" : "Post the day"}
        </button>
        {src ? (
          <>
            <button
              type="button"
              onClick={() => void postX()}
              className="hud-chip h-10 border border-line px-4 font-mono text-[11px] uppercase tracking-wider text-entry"
            >
              Post to X
            </button>
            <button
              type="button"
              onClick={() => void save()}
              className="hud-chip h-10 border border-line px-4 font-mono text-[11px] uppercase tracking-wider text-muted"
            >
              Save card
            </button>
          </>
        ) : null}
      </div>
      {empty ? <p className="font-mono text-[11px] text-muted">No fish today. Close a trade, then mount it.</p> : null}
      {src ? (
        <img src={src} alt="Catch of the day trophy card" className="mt-2 w-full outline outline-1 -outline-offset-1 outline-entry/20" />
      ) : null}
      {note ? <p className={cn("font-mono text-[11px] text-muted")}>{note}</p> : null}
    </div>
  );
}
