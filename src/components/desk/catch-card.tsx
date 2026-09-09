import { useRef, useState } from "react";
import { drawDeskChart } from "@/components/desk/chart";
import { useDesk } from "@/lib/desk-store";
import { imagineCatch } from "@/lib/grok";
import { cn } from "@/lib/utils";
import type { Analysis, Candle, ClosedTrade } from "@/lib/strat/types";

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

function moneyFull(n: number) {
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function caption(c: Catch) {
  const wr = c.rows.length ? Math.round((c.wins / c.rows.length) * 100) : 0;
  const sign = c.netR >= 0 ? "+" : "";
  const trophy = c.best
    ? `Trophy: ${c.best.side} ${c.best.sym} ${moneyFull(c.best.pnl)} · ${c.best.rMult >= 0 ? "+" : ""}${c.best.rMult.toFixed(2)}R · ${c.best.reason}`
    : "No trophy yet.";
  return [
    `S&D desk · ${c.day}`,
    `${c.rows.length} fish · ${c.wins}W/${c.losses}L · ${wr}% · ${moneyFull(c.pnl)} · ${sign}${c.netR.toFixed(2)}R`,
    trophy,
    "",
    "AMD distribution only. Trail. Flatten at NY close.",
    "#SupplyAndDemand #AMD",
  ].join("\n");
}

const TROPHY_FISH = [
  "Atlantic blue marlin",
  "black marlin",
  "Pacific sailfish",
  "swordfish",
  "yellowfin tuna",
  "bluefin tuna",
  "mahi-mahi",
  "tarpon",
  "giant trevally",
  "roosterfish",
  "wahoo",
  "snook",
  "red snapper",
  "permit",
  "giant grouper",
  "kraken",
  "leviathan",
  "sea serpent",
  "megalodon",
  "dragonfish",
  "phoenix koi",
  "celestial whale",
  "thunder eel",
  "aurora marlin",
] as const;

function imaginePrompt(c: Catch) {
  const fish = TROPHY_FISH[Math.floor(Math.random() * TROPHY_FISH.length)];
  const mythic = /kraken|leviathan|serpent|megalodon|dragon|phoenix|celestial|thunder|aurora/i.test(fish);
  const vibe = c.best ? `${c.best.side} ${c.best.sym}` : "the day's catch";
  return [
    mythic
      ? `Photoreal cinematic 16:9 photograph of a legendary ${fish} mounted as a museum trophy on a black carbon fiber wall, hyper-real scales and wet skin, not cartoon, not illustration.`
      : `Photoreal cinematic 16:9 photograph of a massive ${fish} taxidermy-mounted on a black carbon fiber wall.`,
    "Luxury night trading den, mint LED strip framing the wall, gallery spotlights, faint candlestick charts glowing in the dark behind the fish.",
    `Energy of a ${vibe} trophy.`,
    "No brass plaque, no gold plate, no text, no letters, no numbers, no captions, no watermarks, no people, no logos.",
    "Leave empty dark wall below the fish for a plaque.",
  ].join(" ");
}

function liveChart(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>("canvas[data-sd-chart]");
}

function roundBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 18) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const ir = img.width / Math.max(1, img.height);
  const r = w / Math.max(1, h);
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (ir > r) {
    sw = img.height * r;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / r;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("fish"));
    img.src = src;
  });
}

function brassFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "#f1d78a");
  g.addColorStop(0.22, "#c9a227");
  g.addColorStop(0.55, "#8d6b1c");
  g.addColorStop(1, "#e6c86a");
  ctx.fillStyle = g;
  roundBox(ctx, x, y, w, h, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 236, 170, 0.55)";
  ctx.lineWidth = 2;
  roundBox(ctx, x, y, w, h, 18);
  ctx.stroke();
}

async function localCard(
  c: Catch,
  desk: { candles: Record<string, Candle[]>; analysis: Record<string, Analysis>; ha: boolean; symbol: string },
  fish?: HTMLImageElement,
): Promise<Blob> {
  await document.fonts?.ready?.catch(() => undefined);
  const W = 1920;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");

  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, W, H);

  if (fish) {
    drawCover(ctx, fish, 0, -40, W, 820);
  } else {
    ctx.fillStyle = "#101318";
    ctx.fillRect(0, 0, W, 760);
  }

  ctx.strokeStyle = "rgba(94,234,212,0.55)";
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 28, W - 72, 700);
  ctx.strokeStyle = "rgba(94,234,212,0.18)";
  ctx.lineWidth = 10;
  ctx.strokeRect(28, 20, W - 56, 716);

  const fade = ctx.createLinearGradient(0, 560, 0, 760);
  fade.addColorStop(0, "rgba(7,8,12,0)");
  fade.addColorStop(1, "rgba(7,8,12,0.92)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 560, W, 200);

  const px = 70;
  const py = 690;
  const pw = W - 140;
  const ph = 350;
  brassFill(ctx, px, py, pw, ph);
  const ix = px + 16;
  const iy = py + 16;
  const iw = pw - 32;
  const ih = ph - 32;
  roundBox(ctx, ix, iy, iw, ih, 12);
  ctx.fillStyle = "#070b10";
  ctx.fill();
  ctx.save();
  roundBox(ctx, ix, iy, iw, ih, 12);
  ctx.clip();

  const left = 500;
  ctx.fillStyle = "#5eead4";
  ctx.font = "600 15px Rajdhani, IBM Plex Mono, sans-serif";
  ctx.fillText("SUPPLY AND DEMAND  ·  THE DAY'S CATCH", ix + 28, iy + 36);
  ctx.fillStyle = "#8aa09c";
  ctx.font = "13px IBM Plex Mono, monospace";
  ctx.fillText(c.day, ix + 28, iy + 58);

  ctx.fillStyle = c.pnl >= 0 ? "#3ee8a0" : "#ff5d73";
  ctx.font = "700 64px Rajdhani, sans-serif";
  ctx.fillText(moneyFull(c.pnl), ix + 28, iy + 128);
  ctx.fillStyle = "#d7ece8";
  ctx.font = "16px IBM Plex Mono, monospace";
  const sign = c.netR >= 0 ? "+" : "";
  ctx.fillText(`${sign}${c.netR.toFixed(2)}R   ${c.wins}W / ${c.losses}L   ${c.rows.length} FISH`, ix + 28, iy + 158);

  if (c.best) {
    ctx.fillStyle = "#5eead4";
    ctx.font = "600 12px Rajdhani, sans-serif";
    ctx.fillText("TROPHY", ix + 28, iy + 192);
    ctx.fillStyle = "#d7ece8";
    ctx.font = "700 26px Rajdhani, sans-serif";
    ctx.fillText(`${c.best.side}  ${c.best.sym}`, ix + 28, iy + 222);
    ctx.fillStyle = c.best.pnl >= 0 ? "#3ee8a0" : "#ff5d73";
    ctx.font = "16px IBM Plex Mono, monospace";
    ctx.fillText(`${moneyFull(c.best.pnl)}  ·  ${c.best.rMult >= 0 ? "+" : ""}${c.best.rMult.toFixed(2)}R  ${c.best.reason}`, ix + 28, iy + 248);
  }

  c.rows
    .filter((t) => t.id !== c.best?.id)
    .slice(0, 3)
    .forEach((t, i) => {
      ctx.fillStyle = t.pnl >= 0 ? "#3ee8a0" : "#ff5d73";
      ctx.font = "13px IBM Plex Mono, monospace";
      ctx.fillText(`${t.side} ${t.sym}  ${moneyFull(t.pnl)}  ${t.rMult >= 0 ? "+" : ""}${t.rMult.toFixed(2)}R`, ix + 28, iy + 278 + i * 18);
    });

  const cx = ix + left;
  const cy = iy + 12;
  const cw = iw - left - 12;
  const ch = ih - 24;
  const pane = document.createElement("canvas");
  pane.width = cw;
  pane.height = ch;
  const pctx = pane.getContext("2d");
  if (pctx) {
    pctx.fillStyle = "#070b10";
    pctx.fillRect(0, 0, cw, ch);
    const trophy = c.best;
    const chartSym = trophy?.sym ?? desk.symbol;
    const bars = desk.candles[chartSym] ?? desk.candles[desk.symbol] ?? [];
    const shot = liveChart();
    const trade =
      trophy && Number.isFinite(Number(trophy.entry)) && Number.isFinite(trophy.exit)
        ? { side: trophy.side, entry: Number(trophy.entry), exit: trophy.exit }
        : undefined;
    if (bars.length > 8) {
      drawDeskChart(pctx, cw, ch, {
        symbol: chartSym,
        candles: bars,
        analysis: desk.analysis[chartSym] ?? desk.analysis[desk.symbol],
        ha: desk.ha,
        trade,
      });
    } else if (shot && shot.width > 0) {
      pctx.drawImage(shot, 0, 0, cw, ch);
    }
    ctx.drawImage(pane, cx, cy);
    ctx.strokeStyle = "rgba(94,234,212,0.28)";
    ctx.lineWidth = 1;
    roundBox(ctx, cx, cy, cw, ch, 10);
    ctx.stroke();
  }
  ctx.restore();

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob failed"))), "image/png");
  });
}

export function CatchCard({ closed }: { closed: ClosedTrade[] }) {
  const catchOf = dayCatch(closed);
  const empty = catchOf.rows.length === 0;
  const symbol = useDesk((s) => s.symbol);
  const candles = useDesk((s) => s.candles);
  const analysis = useDesk((s) => s.analysis);
  const ha = useDesk((s) => s.ha);
  const [src, setSrc] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const lock = useRef(false);

  async function mount() {
    if (empty || lock.current) return src;
    lock.current = true;
    setBusy(true);
    setNote("");
    try {
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
      let fish: HTMLImageElement | undefined;
      const imagined = await imagineCatch({ data: { prompt: imaginePrompt(catchOf) } });
      if (imagined.ok) {
        fish = await loadImg(imagined.src).catch(() => undefined);
      }
      if (!fish) {
        fish = await loadImg("/catch/trophy-mount.jpg").catch(() => undefined);
        if (imagined.ok === false) setNote(`${imagined.error} · mounted house trophy`);
      }
      const blob = await localCard(catchOf, { candles, analysis, ha, symbol }, fish);
      const url = URL.createObjectURL(blob);
      setSrc(url);
      return url;
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Card failed");
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
        setNote("Shared. If X didn't open, caption is copied — attach the card.");
        return;
      } catch {
        /* compose fallback */
      }
    }
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setNote("Caption copied. X compose is open — attach the catch card.");
  }

  async function openAi(destination: "chatgpt" | "grok") {
    const tab = window.open("about:blank", "_blank");
    const text = `${caption(catchOf)}\n\nHelp me polish and post this trading recap.`;
    const url = src || (await mount());
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    const destinationUrl = destination === "chatgpt" ? "https://chatgpt.com/" : "https://grok.com/";
    if (tab) {
      tab.opener = null;
      tab.location.href = destinationUrl;
    } else {
      window.open(destinationUrl, "_blank", "noopener,noreferrer");
    }
    setNote(`${destination === "chatgpt" ? "ChatGPT" : "Grok"} opened for sign-in. Caption copied${url ? " — attach the card shown below" : ""}.`);
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
          {busy ? "Mounting…" : "Create post of the day"}
        </button>
        <button type="button" disabled={empty || busy} onClick={() => void openAi("chatgpt")} className="hud-chip h-10 border border-line px-4 font-mono text-[11px] uppercase tracking-wider text-entry">
          Open ChatGPT
        </button>
        <button type="button" disabled={empty || busy} onClick={() => void openAi("grok")} className="hud-chip h-10 border border-line px-4 font-mono text-[11px] uppercase tracking-wider text-entry">
          Open Grok
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
        <img src={src} alt="Catch of the day card" className="mt-2 w-full outline outline-1 -outline-offset-1 outline-entry/20" />
      ) : null}
      {note ? <p className={cn("font-mono text-[11px] text-muted")}>{note}</p> : null}
    </div>
  );
}
