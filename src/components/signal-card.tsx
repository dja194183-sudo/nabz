import { Link } from "@tanstack/react-router";
import { ChevronLeft, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CandleChart } from "@/components/candle-chart";
import { PipelineStrip } from "@/components/pipeline-strip";
import { ExitBanner, StretchBanner } from "@/components/status-banner";
import { Sparkline } from "@/components/sparkline";
import {
  entryStateLabel,
  expansionLabel,
  fmtPct,
  fmtPrice,
  lockHint,
  sideLabel,
} from "@/lib/format";
import { useAppStore } from "@/lib/store";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SignalCard({
  signal,
  compact = false,
}: {
  signal: Signal;
  compact?: boolean;
}) {
  const watchlist = useAppStore((s) => s.watchlist);
  const toggleWatch = useAppStore((s) => s.toggleWatch);
  const watched = watchlist.includes(signal.symbol);
  const isLong = signal.side === "long";
  const up = signal.change24h >= 0;
  const wrReady = signal.backtest.n >= 6;

  return (
    <article className="rounded-2xl bg-card p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-semibold tracking-tight">
              {signal.base}
            </h3>
            {signal.side ? (
              <Badge
                className={cn(
                  isLong ? "bg-long/15 text-long" : "bg-short/15 text-short",
                )}
              >
                {sideLabel(signal.side)}
              </Badge>
            ) : null}
            {signal.entryState !== "ready" ? (
              <Badge className="bg-short/15 text-short">
                {entryStateLabel(signal.entryState)}
              </Badge>
            ) : signal.pipeline.triggerOk ? (
              <Badge className="bg-surface text-foreground">تریگر ۵M</Badge>
            ) : signal.tier === "watch" ? (
              <Badge className="bg-surface text-muted-foreground">نزدیک</Badge>
            ) : null}
            {signal.exitAlert.level === "emergency" ? (
              <Badge className="bg-short/15 text-short">خروج اضطراری</Badge>
            ) : null}
            {signal.expansion?.kind === "expansion" ? (
              <Badge className="bg-long/15 text-long">
                {expansionLabel(signal.expansion.kind, signal.expansion.bias)}
              </Badge>
            ) : signal.expansion?.kind === "coil" ? (
              <Badge className="bg-surface text-muted-foreground">فشرده</Badge>
            ) : null}
          </div>
          <p className="mt-0.5 font-mono text-[13px] tabular-nums text-muted-foreground" dir="ltr">
            {fmtPrice(signal.price)}{" "}
            <span className={up ? "text-long" : "text-short"}>
              {fmtPct(signal.change24h)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          {signal.candles && signal.candles.length >= 8 ? (
            <div className="w-[108px] overflow-hidden rounded-md">
              <CandleChart
                candles={signal.candles.slice(-40)}
                height={44}
                compact
              />
            </div>
          ) : (
            <Sparkline values={signal.spark} up={up} />
          )}
          <button
            type="button"
            aria-label={watched ? "حذف از واچ‌لیست" : "افزودن به واچ‌لیست"}
            onClick={() => toggleWatch(signal.symbol)}
            className="relative flex size-11 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <Star
              className={cn("size-4", watched && "fill-foreground text-foreground")}
            />
          </button>
        </div>
      </div>

      {!compact && signal.candles && signal.candles.length >= 8 ? (
        <div className="mt-3 overflow-hidden rounded-xl bg-card">
          <CandleChart
            candles={signal.candles}
            height={128}
            compact
          />
        </div>
      ) : null}

      <div className="mt-3">
        <PipelineStrip pipeline={signal.pipeline} compact />
      </div>

      {!compact ? (
        <>
          <StretchBanner state={signal.entryState} stretchAtr={signal.stretchAtr} />
          <ExitBanner alert={signal.exitAlert} />
        </>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="اعتماد" value={`${signal.score}`} />
        <Stat
          label="وین‌ریت"
          value={wrReady ? `${Math.round(signal.backtest.winRate)}٪` : "—"}
          hint={wrReady ? `${signal.backtest.n} معامله` : "نمونه کم"}
        />
        <Stat
          label="PF"
          value={
            wrReady && signal.backtest.profitFactor > 0
              ? signal.backtest.profitFactor >= 20
                ? "∞"
                : signal.backtest.profitFactor.toFixed(2)
              : "—"
          }
          hint={wrReady ? `میانگین ${signal.backtest.avgR.toFixed(2)}R` : "با کارمزد"}
        />
      </div>

      {!compact ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <Row
            k="ورود"
            v={fmtPrice(signal.entry)}
            extra={
              signal.entryState !== "ready"
                ? entryStateLabel(signal.entryState)
                : signal.entryLocked
                  ? "قفل"
                  : signal.entryKind === "limit"
                    ? "لیمیت"
                    : "مارکت"
            }
          />
          <Row k="حد ضرر" v={fmtPrice(signal.sl)} />
          <Row k="هدف ۱" v={fmtPrice(signal.tp1)} />
          <Row k="هدف ۲" v={fmtPrice(signal.tp2)} />
        </dl>
      ) : null}

      <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
        {signal.pipeline.reason}
        {signal.entryLocked ? ` · ${lockHint(signal.issuedAt, true)}` : ""}
      </p>

      <div className="mt-3 flex items-center justify-between">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
          <div
            className={cn("h-full rounded-full", isLong ? "bg-long" : "bg-short")}
            style={{ width: `${Math.min(100, signal.score)}%` }}
          />
        </div>
        <Link
          to="/pair/$symbol"
          params={{ symbol: signal.symbol }}
          className="ms-3 inline-flex h-11 items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          جزئیات
          <ChevronLeft className="size-4" />
        </Link>
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-surface px-2.5 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-mono text-[15px] font-medium tabular-nums" dir="ltr">
        {value}
      </p>
      {hint ? <p className="text-[10px] text-subtle">{hint}</p> : null}
    </div>
  );
}

function Row({ k, v, extra }: { k: string; v: string; extra?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-mono tabular-nums" dir="ltr">
        {v}
        {extra ? (
          <span className="font-sans text-[11px] text-subtle"> {extra}</span>
        ) : null}
      </dd>
    </div>
  );
}
