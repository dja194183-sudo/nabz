import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, ExternalLink, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CandleChart } from "@/components/candle-chart";
import { LeveragePills } from "@/components/leverage-pills";
import { PipelineStrip } from "@/components/pipeline-strip";
import { ExitBanner, StretchBanner } from "@/components/status-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  entryStateLabel,
  expansionLabel,
  fmtFunding,
  fmtPct,
  fmtPrice,
  fmtQty,
  fmtUsd,
  lockHint,
  qtyFromUsdt,
  sideLabel,
  toobitTradeUrl,
} from "@/lib/format";
import { analyzeSetup } from "@/lib/server/analyze";
import { getPairDetail } from "@/lib/server/market";
import { placeToobitOrder } from "@/lib/server/toobit-trade";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Interval } from "@/lib/types";

export const Route = createFileRoute("/pair/$symbol")({
  ssr: false,
  component: PairPage,
});

function PairPage() {
  const { symbol } = Route.useParams();
  const settings = useAppStore((s) => s.settings);
  const [chartTf, setChartTf] = useState<Interval>(settings.timeframe);
  const [confirmOrder, setConfirmOrder] = useState(false);
  const watchlist = useAppStore((s) => s.watchlist);
  const toggleWatch = useAppStore((s) => s.toggleWatch);
  const addTrade = useAppStore((s) => s.addTrade);

  const detail = useQuery({
    queryKey: ["pair", symbol, settings.timeframe, settings.mode, settings.market],
    queryFn: () =>
      getPairDetail({
        data: {
          symbol,
          timeframe: settings.timeframe,
          mode: settings.mode,
          market: symbol.includes("-SWAP-") ? "futures" : settings.market,
        },
      }),
    enabled: typeof window !== "undefined",
  });

  const ai = useMutation({
    mutationFn: () => {
      const s = detail.data;
      if (!s) throw new Error("ابتدا داده جفت ارز بارگذاری شود");
      return analyzeSetup({
        data: {
          symbol: s.symbol,
          base: s.base,
          side: s.side,
          score: s.score,
          entry: s.entry,
          sl: s.sl,
          tp1: s.tp1,
          rsi: s.rsi,
          adx: s.adx,
          funding: s.funding,
          htf: s.htf,
          winRate: s.backtest.winRate,
          sample: s.backtest.n,
          reason: s.pipeline.reason,
          triggerOk: s.pipeline.triggerOk,
          profitFactor: s.backtest.profitFactor,
        },
      });
    },
    onSuccess: (res) => {
      if (!res.ok) toast.error(res.error);
    },
  });

  const s = detail.data;
  const watched = watchlist.includes(symbol);

  function paper() {
    if (!s || !s.side) return;
    const usdt = settings.orderUsd || settings.capital || 50;
    const qty = qtyFromUsdt(usdt, s.entry);
    addTrade({
      id: `${s.symbol}-${Date.now()}`,
      symbol: s.symbol,
      base: s.base,
      side: s.side,
      entry: s.entry,
      sl: s.sl,
      tp1: s.tp1,
      tp2: s.tp2,
      qty,
      usdt,
      leverage:
        settings.leverageBySymbol[s.symbol] ??
        Math.min(settings.leverage, s.maxLeverage || settings.leverage),
      takerBps: s.takerBps,
      makerBps: s.makerBps,
      riskUsd: Math.abs(s.entry - s.sl) * qty,
      market: s.market,
      openedAt: Date.now(),
      source: "signal",
    });
    toast.success("در ژورنال کاغذی ثبت شد");
  }

  const send = useMutation({
    mutationFn: () => {
      if (!s || !s.side) throw new Error("سیگنال جهت ندارد");
      const qty = qtyFromUsdt(settings.orderUsd || 50, s.entry);
      return placeToobitOrder({
        data: {
          apiKey: settings.apiKey,
          secret: settings.apiSecret,
          market: s.market,
          symbol: s.symbol,
          side: s.side,
          entryKind: s.entryKind,
          quantity: qty,
          price: s.entryKind === "limit" ? s.entry : s.price,
          sl: s.sl,
          tp: s.tp1,
          leverage: settings.leverage,
        },
      });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message);
        setConfirmOrder(false);
        paper();
      } else toast.error(res.message);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "سفارش ارسال نشد"),
  });

  return (
    <AppShell>
      <header className="flex items-center gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link
          to="/"
          className="flex size-11 items-center justify-center text-muted-foreground"
          aria-label="بازگشت"
        >
          <ChevronRight className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[18px] font-semibold">
            {s?.base ?? symbol.replace("-SWAP-USDT", "")}
          </h1>
          <p className="text-[12px] text-muted-foreground">
            {s?.market === "spot" ? "اسپات توبیت" : "پرپچوال توبیت"} · 4H → 1H → 15M → 5M
          </p>
        </div>
        <button
          type="button"
          className="flex size-11 items-center justify-center"
          onClick={() => toggleWatch(symbol)}
        >
          <Star
            className={cn(
              "size-4",
              watched ? "fill-foreground text-foreground" : "text-muted-foreground",
            )}
          />
        </button>
      </header>

      {detail.isLoading ? (
        <div className="space-y-3 px-4 pt-4">
          <Skeleton className="h-56" />
          <Skeleton className="h-40" />
        </div>
      ) : detail.isError || !s ? (
        <p className="px-4 pt-8 text-center text-sm text-muted-foreground">
          جزئیات این نماد بارگذاری نشد.
        </p>
      ) : (
        <div className="px-4 pb-8">
          <div className="mt-2 flex items-end justify-between">
            <p className="font-mono text-[28px] font-medium tabular-nums leading-none" dir="ltr">
              {fmtPrice(s.price)}
            </p>
            <p
              className={cn(
                "font-mono text-[14px] tabular-nums",
                s.change24h >= 0 ? "text-long" : "text-short",
              )}
              dir="ltr"
            >
              {fmtPct(s.change24h)}
            </p>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl bg-card shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
            {(() => {
              const pack = s.charts?.[chartTf] ?? {
                candles: s.candles,
                ema21: s.ema21,
                ema50: s.ema50,
              };
              return (
                <CandleChart
                  candles={pack.candles}
                  ema21={pack.ema21}
                  ema50={pack.ema50}
                  entry={s.entry}
                  sl={s.sl}
                  tp1={s.tp1}
                  height={240}
                />
              );
            })()}
            <div className="grid grid-cols-4 gap-1 p-2">
              {(["5m", "15m", "1h", "4h"] as Interval[]).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setChartTf(tf)}
                  className={cn(
                    "h-9 rounded-lg text-[12px] font-medium",
                    chartTf === tf
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface text-muted-foreground",
                  )}
                >
                  {tf === "5m" ? "۵د" : tf === "15m" ? "۱۵د" : tf === "1h" ? "۱س" : "۴س"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <PipelineStrip pipeline={s.pipeline} />
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
              {s.pipeline.reason}
            </p>
          </div>

          <StretchBanner state={s.entryState} stretchAtr={s.stretchAtr} />
          <ExitBanner alert={s.exitAlert} />

          {!s.dataQuality.ok ? (
            <p className="mt-3 rounded-xl bg-card px-3 py-3 text-[12px] leading-5 text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
              کیفیت داده کامل نیست:{" "}
              {s.dataQuality.frames
                .filter((f) => !f.ok)
                .map((f) => `${f.interval} ${f.reason}`)
                .join(" · ")}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {s.side ? (
              <Badge
                className={
                  s.side === "long" ? "bg-long/15 text-long" : "bg-short/15 text-short"
                }
              >
                {sideLabel(s.side)}
              </Badge>
            ) : null}
            <Badge className="bg-surface text-muted-foreground">
              اعتماد {s.score}
            </Badge>
            {s.entryState !== "ready" ? (
              <Badge className="bg-short/15 text-short">
                {entryStateLabel(s.entryState)}
              </Badge>
            ) : s.tier === "setup" ? (
              <Badge className="bg-surface text-foreground">ستاپ فعال</Badge>
            ) : (
              <Badge className="bg-surface text-muted-foreground">ستاپ نیست</Badge>
            )}
            {s.exitAlert.level === "emergency" ? (
              <Badge className="bg-short/15 text-short">خروج اضطراری</Badge>
            ) : s.pipeline.triggerOk ? (
              <Badge className="bg-long/15 text-long">تریگر ۵M</Badge>
            ) : null}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2">
            <Cell
              k="ورود"
              v={fmtPrice(s.entry)}
              sub={
                s.entryState !== "ready"
                  ? "ورود فوری توصیه نمی‌شود"
                  : s.entryLocked
                    ? s.fillable
                      ? lockHint(s.issuedAt, true)
                      : "قیمت از ورود اول جا مانده"
                    : s.entryKind === "limit"
                      ? "لیمیت روی EMA21"
                      : "مارکت"
              }
            />
            <Cell k="حد ضرر" v={fmtPrice(s.sl)} />
            <Cell k="هدف ۱ · ۱.۲R" v={fmtPrice(s.tp1)} />
            <Cell k="هدف ۲ · ۲R" v={fmtPrice(s.tp2)} />
            <Cell
              k="کارمزد توبیت"
              v={`تیکر ${(s.takerBps ?? 6) / 100}٪`}
              sub={`میکر ${(s.makerBps ?? 2) / 100}٪ · VIP0`}
            />
            <Cell
              k="سقف اهرم"
              v={s.market === "spot" ? "اسپات" : `${s.maxLeverage || "—"}x`}
            />
          </dl>

          {s.market !== "spot" ? (
            <div className="mt-4">
              <LeveragePills symbol={s.symbol} max={s.maxLeverage || 20} />
            </div>
          ) : null}

          {s.expansion.kind !== "none" ? (
            <div className="mt-3 rounded-xl bg-surface px-3 py-3 text-[13px] leading-6 text-muted-foreground">
              <p className="font-medium text-foreground">
                {expansionLabel(s.expansion.kind, s.expansion.bias)}
              </p>
              <p className="mt-1">
                حدس از حجم و فشردگی است، پامپ را تضمین نمی‌کند.
              </p>
              {s.expansion.reasons.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {s.expansion.reasons.map((r) => (
                    <li key={r}>· {r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {(() => {
            const usdt = settings.orderUsd || 50;
            const qty = qtyFromUsdt(usdt, s.entry);
            const risk = Math.abs(s.entry - s.sl) * qty;
            return (
              <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
                حجم ورود {fmtUsd(usdt, 0)} تتر
                {" — "}
                <span className="font-mono text-foreground" dir="ltr">
                  {fmtQty(qty)} {s.base}
                </span>
                {` · ریسک تقریبی تا حد ضرر ${fmtUsd(risk)}`}
                {s.market === "spot"
                  ? " — اسپات اهرم ندارد و این سفارش روی توبیت ثبت نمی‌شود."
                  : ` · اهرم ${settings.leverage}x — سفارش روی توبیت ثبت نمی‌شود.`}
              </p>
            );
          })()}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Cell
              k="وین‌ریت بک‌تست"
              v={s.backtest.n >= 6 ? `${Math.round(s.backtest.winRate)}٪` : "نمونه کم"}
              sub={`${s.backtest.n} معامله · ${s.backtest.wins} برد / ${s.backtest.losses} باخت`}
            />
            <Cell
              k="سود به زیان"
              v={
                s.backtest.n >= 6
                  ? s.backtest.profitFactor >= 20
                    ? "∞"
                    : s.backtest.profitFactor.toFixed(2)
                  : "—"
              }
              sub={`انتظار ${s.backtest.expectancy.toFixed(2)}R · افت ${s.backtest.maxDD.toFixed(2)}R`}
            />
            <Cell k="RSI / ADX" v={`${s.rsi.toFixed(0)} / ${s.adx.toFixed(0)}`} />
            <Cell
              k="فاندینگ"
              v={s.funding == null ? "—" : fmtFunding(s.funding)}
            />
            <Cell
              k="لانگ/شورت"
              v={
                s.longShort
                  ? `${(s.longShort.longAccount * 100).toFixed(0)}/${(s.longShort.shortAccount * 100).toFixed(0)}`
                  : "—"
              }
            />
            <Cell
              k="بهره باز"
              v={s.openInterest != null ? fmtQty(s.openInterest) : "—"}
            />
          </div>

          <p className="mt-3 text-[11px] leading-5 text-subtle">
            بک‌تست همان زنجیره را روی کندل بسته‌شده ۱۵دقیقه اجرا می‌کند؛ اگر حد ضرر و هدف در یک کندل هر دو بخورند اول حد ضرر حساب می‌شود. کارمزد ۰٫۰۵٪ و لغزش ۰٫۰۲٪ هر طرف از نتیجه کم شده. تضمین آینده نیست.
          </p>

          <ul className="mt-4 space-y-1.5">
            {s.reasons.map((r) => (
              <li
                key={r.id + r.label}
                className="flex items-center gap-2 text-[13px]"
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    r.ok ? "bg-long" : "bg-subtle",
                  )}
                />
                <span className={r.ok ? "text-foreground" : "text-muted-foreground"}>
                  {r.label}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button
              variant={s.side === "short" ? "short" : "long"}
              disabled={!s.side || s.entryState !== "ready"}
              onClick={paper}
            >
              {s.entryState !== "ready" ? "ورود فوری نه" : "ثبت در ژورنال"}
            </Button>
            <Button variant="outline" asChild>
              <a href={toobitTradeUrl(s.symbol, s.market)} target="_blank" rel="noreferrer">
                توبیت
                <ExternalLink />
              </a>
            </Button>
          </div>
          <Button
            className="mt-2 w-full"
            variant="outline"
            disabled={!s.side || s.entryState !== "ready"}
            onClick={() => {
              if (!settings.apiKey || !settings.apiSecret) {
                toast.error("اول در تنظیمات کلید API توبیت را بگذار");
                return;
              }
              setConfirmOrder(true);
            }}
          >
            ارسال سفارش به توبیت
          </Button>

          {confirmOrder ? (
            <div className="mt-3 rounded-2xl bg-short/10 p-4 text-[13px] leading-6">
              <p className="font-medium text-foreground">تأیید سفارش واقعی</p>
              <p className="mt-2 text-muted-foreground">
                {sideLabel(s.side!)} {s.base} · حجم {fmtUsd(settings.orderUsd || 50, 0)}{" "}
                ({fmtQty(qtyFromUsdt(settings.orderUsd || 50, s.entry))} {s.base})
                · ورود {fmtPrice(s.entryKind === "limit" ? s.entry : s.price)} · حد ضرر{" "}
                {fmtPrice(s.sl)}
                {s.market === "futures" ? ` · اهرم ${settings.leverage}x` : ""}
              </p>
              <p className="mt-2 text-short">
                این سفارش واقعی است و می‌تواند کل سرمایه را از بین ببرد. ربات نیست؛ فقط همین یک سفارش.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  variant={s.side === "short" ? "short" : "long"}
                  disabled={send.isPending}
                  onClick={() => send.mutate()}
                >
                  {send.isPending ? "در حال ارسال…" : "تأیید و ارسال"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmOrder(false)}>
                  انصراف
                </Button>
              </div>
            </div>
          ) : null}

          <Button
            className="mt-2 w-full"
            variant="ghost"
            disabled={ai.isPending}
            onClick={() => ai.mutate()}
          >
            {ai.isPending ? "در حال تحلیل…" : "تحلیل کوتاه با هوش مصنوعی"}
          </Button>

          {ai.data?.ok ? (
            <div className="mt-3 whitespace-pre-wrap rounded-2xl bg-card p-4 text-[13px] leading-7 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
              {ai.data.text}
            </div>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

function Cell({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-card px-3 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
      <p className="text-[11px] text-muted-foreground">{k}</p>
      <p className="mt-0.5 font-mono text-[15px] font-medium tabular-nums" dir="ltr">
        {v}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] text-subtle">{sub}</p> : null}
    </div>
  );
}
