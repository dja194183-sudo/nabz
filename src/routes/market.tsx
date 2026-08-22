import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Sparkline } from "@/components/sparkline";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtPct, fmtPrice, sideLabel } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useScan } from "@/lib/use-scan";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/market")({
  ssr: false,
  component: MarketPage,
});

function MarketPage() {
  const scan = useScan();
  const market = useAppStore((s) => s.settings.market);
  const [q, setQ] = useState("");
  const watchlist = useAppStore((s) => s.watchlist);
  const toggleWatch = useAppStore((s) => s.toggleWatch);

  const rows = useMemo(() => {
    const list = scan.data?.signals ?? [];
    const query = q.trim().toLowerCase();
    const filtered = query
      ? list.filter(
          (s) =>
            s.base.toLowerCase().includes(query) ||
            s.symbol.toLowerCase().includes(query),
        )
      : list;
    return [...filtered].sort((a, b) => b.volume24h - a.volume24h);
  }, [scan.data, q]);

  return (
    <AppShell>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <h1 className="text-[24px] font-semibold tracking-tight">بازار توبیت</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {market === "spot" ? "اسپات USDT" : "پرپچوال USDT"} · کل بازار · v{APP_VERSION}
          {scan.data
            ? ` · ${scan.data.scanned}/${scan.data.total}${scan.data.done ? "" : " در حال اسکن"}`
            : ""}
        </p>
        <label className="relative mt-4 block">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی نماد"
            dir="rtl"
            className="h-12 w-full rounded-xl bg-card ps-10 pe-4 text-[16px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)] outline-none placeholder:text-subtle focus:shadow-[0_0_0_1px_rgba(255,255,255,0.18)]"
          />
        </label>
      </header>

      <div className="mt-4">
        {scan.isLoading && !scan.data ? (
          <div className="space-y-2 px-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (
          <ul>
            {rows.map((s) => {
              const up = s.change24h >= 0;
              const watched = watchlist.includes(s.symbol);
              return (
                <li
                  key={s.symbol}
                  className="border-b border-border last:border-b-0"
                >
                  <div className="flex items-center gap-1 px-2">
                    <button
                      type="button"
                      className="flex size-11 shrink-0 items-center justify-center text-muted-foreground"
                      onClick={() => toggleWatch(s.symbol)}
                      aria-label="واچ‌لیست"
                    >
                      <Star
                        className={cn(
                          "size-4",
                          watched && "fill-foreground text-foreground",
                        )}
                      />
                    </button>
                    <Link
                      to="/pair/$symbol"
                      params={{ symbol: s.symbol }}
                      className="flex min-h-16 min-w-0 flex-1 items-center justify-between gap-3 py-2 pe-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">{s.base}</p>
                        <p className="text-[12px] text-muted-foreground">
                          {s.tier === "setup"
                            ? `${sideLabel(s.side)} · اعتماد ${s.score}`
                            : s.tier === "watch"
                              ? "نزدیک به ستاپ"
                              : "بدون ستاپ"}
                        </p>
                      </div>
                      <Sparkline values={s.spark} up={up} />
                      <div className="text-start" dir="ltr">
                        <p className="font-mono text-[14px] tabular-nums">
                          {fmtPrice(s.price)}
                        </p>
                        <p
                          className={cn(
                            "font-mono text-[12px] tabular-nums",
                            up ? "text-long" : "text-short",
                          )}
                        >
                          {fmtPct(s.change24h)}
                        </p>
                      </div>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
