import { useLayoutEffect, useRef } from "react";
import type { Candle } from "@/lib/types";

const LONG = "#3d9a78";
const SHORT = "#c45c5c";
const GRID = "rgba(255,255,255,0.08)";
const EMA21 = "rgba(232,233,236,0.62)";
const EMA50 = "rgba(232,233,236,0.28)";
const FG = "#c8ccd4";
const BG = "#121214";

export function CandleChart({
  candles,
  ema21 = [],
  ema50 = [],
  sl,
  tp1,
  entry,
  height = 220,
  compact = false,
}: {
  candles: Candle[];
  ema21?: (number | null)[];
  ema50?: (number | null)[];
  sl?: number;
  tp1?: number;
  entry?: number;
  height?: number;
  compact?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const parent = wrapRef.current;
    if (!canvas || !parent || candles.length < 2) return;
    let raf = 0;
    let ro: ResizeObserver | null = null;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.max(1, parent.clientWidth);
      const cssH = height;
      if (cssW < 8) {
        raf = requestAnimationFrame(draw);
        return;
      }
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, cssW, cssH);

      const pad = compact
        ? { l: 4, r: 4, t: 8, b: 6 }
        : { l: 8, r: 54, t: 12, b: 14 };
      const w = Math.max(1, cssW - pad.l - pad.r);
      const h = Math.max(1, cssH - pad.t - pad.b);
      const extras = compact
        ? []
        : [sl, tp1, entry].filter(
            (n): n is number => typeof n === "number" && Number.isFinite(n),
          );
      let min = Math.min(...candles.map((c) => c.l), ...extras);
      let max = Math.max(...candles.map((c) => c.h), ...extras);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        min -= 1;
        max += 1;
      }
      const span = max - min;
      const y = (p: number) => pad.t + ((max - p) / span) * h;
      const slot = w / candles.length;

      if (!compact) {
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const yy = pad.t + (h / 3) * i;
          ctx.beginPath();
          ctx.moveTo(pad.l, yy);
          ctx.lineTo(pad.l + w, yy);
          ctx.stroke();
        }
        const dash = (price: number, color: string) => {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.setLineDash([4, 4]);
          ctx.globalAlpha = 0.75;
          ctx.beginPath();
          ctx.moveTo(pad.l, y(price));
          ctx.lineTo(pad.l + w, y(price));
          ctx.stroke();
          ctx.restore();
        };
        if (entry) dash(entry, FG);
        if (sl) dash(sl, SHORT);
        if (tp1) dash(tp1, LONG);
      }

      candles.forEach((c, i) => {
        const x = pad.l + i * slot + slot / 2;
        const up = c.c >= c.o;
        ctx.strokeStyle = up ? LONG : SHORT;
        ctx.fillStyle = up ? LONG : SHORT;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y(c.h));
        ctx.lineTo(x, y(c.l));
        ctx.stroke();
        const bodyTop = y(Math.max(c.o, c.c));
        const bodyBot = y(Math.min(c.o, c.c));
        const bh = Math.max(compact ? 1 : 1.2, bodyBot - bodyTop);
        const bw = Math.max(compact ? 1.2 : 1.8, slot * (compact ? 0.7 : 0.62));
        ctx.fillRect(x - bw / 2, bodyTop, bw, bh);
      });

      if (!compact) {
        const line = (arr: (number | null)[], color: string) => {
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.25;
          let started = false;
          const n = Math.min(arr.length, candles.length);
          for (let i = 0; i < n; i++) {
            const v = arr[i];
            if (v == null) continue;
            const x = pad.l + i * slot + slot / 2;
            if (!started) {
              ctx.moveTo(x, y(v));
              started = true;
            } else ctx.lineTo(x, y(v));
          }
          ctx.stroke();
        };
        line(ema21, EMA21);
        line(ema50, EMA50);
        const last = candles[candles.length - 1]!.c;
        ctx.fillStyle = FG;
        ctx.font = "500 10px 'IBM Plex Mono', ui-monospace, monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(last.toLocaleString("en-US"), pad.l + w + 6, y(last));
      }
    };

    draw();
    raf = requestAnimationFrame(draw);
    ro = new ResizeObserver(() => draw());
    ro.observe(parent);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [candles, ema21, ema50, sl, tp1, entry, height, compact]);

  if (candles.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[13px] text-muted-foreground"
        style={{ height }}
      >
        کندل کافی نیست
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="w-full"
      dir="ltr"
      style={{ height, minHeight: height }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
