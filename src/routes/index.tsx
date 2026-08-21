import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SignalCard } from "@/components/signal-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgoFa } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useScan } from "@/lib/use-scan";
import type { MarketKind, Signal } from "@/lib/types";
import { APP_VERSION } from "@/lib/version";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Home,
});

function Home() {
  const scan = useScan();
  const wrFilter = useAppStore((s) => s.wrFilter);
  const setWrFilter = useAppStore((s) => s.setWrFilter);
  const minWinRate = useAppStore((s) => s.settings.minWinRate);
  const mode = useAppStore((s) => s.settings.mode);
  const market = useAppStore((s) => s.settings.market);
  const setSettings = useAppStore((s) => s.setSettings);
  const watchlist = useAppStore((s) => s.watchlist);

  const all = scan.data?.signals ?? [];
  const setups = all.filter((s) => s.tier === "setup");
  const wrOk = (s: Signal) =>
    !wrFilter || s.backtest.n < 6 || s.backtest.winRate >= minWinRate;
  const ready = setups.filter((s) => s.entryState === "ready" && wrOk(s));
  const waiting = setups.filter((s) => s.entryState !== "ready" && wrOk(s));
  const watchNear = all.filter(
    (s) => s.tier === "watch" && watchlist.includes(s.symbol),
  );
  const hotMove = all.filter(
    (s) =>
      s.expansion?.kind === "expansion" &&
      s.expansion.score >= 58 &&
      !ready.some((r) => r.symbol === s.symbol) &&
      !waiting.some((r) => r.symbol === s.symbol),
  );

  return (
    <AppShell>
      <header className="sticky top-0 z-20 flex items-end justify-between gap-3 bg-background/90 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] text-muted-foreground">
            TOOBIT {market === "spot" ? "SPOT" : "FUTURES"} · v{APP_VERSION}
          </p>
          <h1 className="font-sans text-[28px] font-semibold leading-none tracking-tight">
            NABZ
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            void scan.refresh();
          }}
          disabled={scan.isRefreshing}
          className="flex h-11 items-center gap-2 text-[12px] text-muted-foreground disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${scan.isRefreshing ? "animate-spin" : ""}`} />
          {scan.isRefreshing
            ? "در حال به‌روز…"
            : scan.data
              ? timeAgoFa(scan.data.updatedAt)
              : "اسکن"}
        </button>
      </header>

      <div className="px-4">
        <p className="text-[13px] leading-6 text-muted-foreground">
          فقط ستاپ‌هایی که 4H و 1H هم‌جهت‌اند و 15M فرصت ورود می‌سازد. اگر قیمت از
          ورود دور شود ورود فوری توصیه نمی‌شود. خروج اضطراری جدا از حد ضرر است و
          تضمین سود نیست.
        </p>
        {scan.data && !scan.data.done ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            در حال بررسی کل بازار · {scan.data.scanned} از {scan.data.total} نماد
          </p>
        ) : scan.data?.done ? (
          <p className="mt-2 text-[12px] text-subtle">
            {scan.data.total} نماد بررسی شد
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {(["futures", "spot"] as MarketKind[]).map((m) => (
            <ModeChip
              key={m}
              active={market === m}
              onClick={() => setSettings({ market: m })}
            >
              {m === "futures" ? "فیوچرز" : "اسپات"}
            </ModeChip>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <ModeChip
            active={mode === "strict"}
            onClick={() => setSettings({ mode: "strict", minWinRate: 52 })}
          >
            محافظه‌کار
          </ModeChip>
          <ModeChip
            active={mode === "balanced"}
            onClick={() => setSettings({ mode: "balanced", minWinRate: 48 })}
          >
            متعادل
          </ModeChip>
        </div>
      </div>

      <section className="mt-5 space-y-3 px-4">
        {scan.isLoading && !scan.data ? (
          <>
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
            <Skeleton className="h-36" />
          </>
        ) : scan.isError ? (
          <Empty
            title="اسکن انجام نشد"
            body="ارتباط با بازار توبیت برقرار نشد. چند لحظه بعد دوباره تلاش کن."
            action={
              <Button onClick={() => scan.refetch()} size="sm">
                تلاش دوباره
              </Button>
            }
          />
        ) : ready.length === 0 ? (
          <Empty
            title="الان ورود فوری نیست"
            body={
              waiting.length > 0
                ? "ستاپ هست، اما قیمت از ورود فاصله گرفته. تعقیب نکن؛ منتظر پولبک باش."
                : wrFilter && setups.length > 0
                  ? "سیگنال هست، اما وین‌ریت بک‌تست‌شان زیر فیلتر توست."
                : !scan.data?.done
                  ? "بازار در حال اسکن است. ستاپ‌ها به مرور می‌آیند."
                  : "بازار در این لحظه هم‌ترازی کافی ندارد. این یعنی فیلتر کار می‌کند."
            }
            action={
              wrFilter && setups.length > 0 && waiting.length === 0 ? (
                <Button variant="outline" size="sm" onClick={() => setWrFilter(false)}>
                  نمایش بدون فیلتر وین‌ریت
                </Button>
              ) : mode === "strict" && waiting.length === 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettings({ mode: "balanced", minWinRate: 48 })}
                >
                  تغییر به حالت متعادل
                </Button>
              ) : null
            }
          />
        ) : (
          ready.map((s) => <SignalCard key={s.symbol} signal={s} />)
        )}
      </section>

      {waiting.length > 0 ? (
        <section className="mt-8 px-4">
          <h2 className="mb-2 text-[13px] font-medium text-muted-foreground">
            فاصله گرفته — ورود فوری نکن
          </h2>
          <p className="mb-3 text-[12px] leading-5 text-subtle">
            این‌ها هنوز همان ستاپ‌اند، ولی قیمت از نقطه ورود دور شده. صبر برای پولبک بهتر از تعقیب است.
          </p>
          <div className="space-y-3">
            {waiting.map((s) => (
              <SignalCard key={s.symbol} signal={s} />
            ))}
          </div>
        </section>
      ) : null}

      {hotMove.length > 0 ? (
        <section className="mt-8 px-4">
          <h2 className="mb-2 text-[13px] font-medium text-muted-foreground">
            احتمال حرکت تند
          </h2>
          <p className="mb-3 text-[12px] leading-5 text-subtle">
            از روی حجم و فشردگی است، نه پیش‌بینی پامپ. ممکن است همان‌قدر دامپ شود.
          </p>
          <div className="space-y-3">
            {hotMove.map((s) => (
              <SignalCard key={s.symbol} signal={s} compact />
            ))}
          </div>
        </section>
      ) : null}

      {watchNear.length > 0 ? (
        <WatchBlock items={watchNear} />
      ) : null}

      <p className="px-4 py-8 text-center text-[11px] leading-5 text-subtle">
        فیوچرز می‌تواند کل موجودی را صفر کند. حجم را با ریسک ۱٪ حساب کن و هرگز
        با پولی که تحمل از دست دادنش را نداری معامله نکن.
      </p>
    </AppShell>
  );
}

function ModeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-full px-4 text-[13px] font-medium transition-colors duration-150 ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card px-5 py-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

function WatchBlock({ items }: { items: Signal[] }) {
  return (
    <section className="mt-8 px-4">
      <h2 className="mb-3 text-[13px] font-medium text-muted-foreground">
        واچ‌لیست نزدیک به ورود
      </h2>
      <div className="space-y-3">
        {items.map((s) => (
          <SignalCard key={s.symbol} signal={s} compact />
        ))}
      </div>
    </section>
  );
}
