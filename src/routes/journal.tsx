import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PipelineStrip } from "@/components/pipeline-strip";
import { ExitBanner } from "@/components/status-banner";
import { Button } from "@/components/ui/button";
import {
  baseFromSymbol,
  expansionLabel,
  fmtPnl,
  fmtPnlPct,
  fmtPrice,
  fmtUsd,
  qtyFromUsdt,
  qtyFromMargin,
  roundTripFee,
  resolveSymbol,
  sideLabel,
} from "@/lib/format";
import { alertForOpenTrade } from "@/lib/risk";
import { getMarkPrices, getTickersLite } from "@/lib/server/market";
import { useAppStore } from "@/lib/store";
import type { MarketKind, PaperTrade, Side, Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/journal")({
  ssr: false,
  component: JournalPage,
});

function JournalPage() {
  const journal = useAppStore((s) => s.journal);
  const closeTrade = useAppStore((s) => s.closeTrade);
  const removeTrade = useAppStore((s) => s.removeTrade);
  const updateTrade = useAppStore((s) => s.updateTrade);
  const settings = useAppStore((s) => s.settings);
  const [editId, setEditId] = useState<string | null>(null);
  const prices = useQuery({
    queryKey: ["tickers-lite"],
    queryFn: () => getTickersLite(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: typeof window !== "undefined",
  });
  const openSymbols = journal.filter((t) => !t.closedAt).map((t) => t.symbol);
  const marks = useQuery({
    queryKey: ["marks", [...openSymbols].sort().join("|")],
    queryFn: () => getMarkPrices({ data: { symbols: openSymbols } }),
    refetchInterval: 12_000,
    staleTime: 8_000,
    enabled: typeof window !== "undefined" && openSymbols.length > 0,
  });
  const lastScan = useAppStore((s) => s.lastScan);
  const priceMap = new Map(prices.data?.map((t) => [t.symbol, t.price]) ?? []);
  const markMap = new Map(
    (marks.data ?? []).map((r) => [r.symbol, r.mark] as const),
  );
  const bySymbol = new Map(lastScan?.signals.map((s) => [s.symbol, s]) ?? []);

  const open = journal.filter((t) => !t.closedAt);
  const closed = journal.filter((t) => t.closedAt);
  const wins = closed.filter((t) => t.result === "win").length;
  const wr = closed.length ? (wins / closed.length) * 100 : 0;
  const pnl = closed.reduce((a, t) => a + (t.pnlUsd ?? 0), 0);

  function analysis(t: PaperTrade): Signal | undefined {
    return bySymbol.get(t.symbol);
  }

  return (
    <AppShell>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <h1 className="text-[24px] font-semibold tracking-tight">ژورنال</h1>
        <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
          هم سیگنال NABZ هم معامله‌ای که خودت باز کردی. خروج اضطراری و زنجیره روی هر دو اجرا می‌شود.
        </p>
        <TransferBar />
      </header>

      <div className="mt-4 grid grid-cols-3 gap-2 px-4">
        <Stat label="باز" value={`${open.length}`} />
        <Stat label="وین‌ریت تو" value={closed.length ? `${Math.round(wr)}٪` : "—"} />
        <Stat label="PnL" value={fmtUsd(pnl)} tone={pnl >= 0 ? "long" : "short"} />
      </div>

      <ManualTradeForm tickers={prices.data ?? []} />

      <section className="mt-6 px-4">
        <h2 className="mb-3 text-[13px] font-medium text-muted-foreground">
          موقعیت‌های باز
        </h2>
        {open.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-6 text-center text-[13px] text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
            هنوز معامله‌ای نیست. از فرم بالا معامله خودت را بده یا از سیگنال «ثبت» کن.
          </p>
        ) : (
          <div className="space-y-3">
            {open.map((t) => {
              const last = priceMap.get(t.symbol) ?? analysis(t)?.price;
              const px = markMap.get(t.symbol) ?? last;
              const sig = analysis(t);
              const alert = alertForOpenTrade(t.side, sig);
              const lev = t.market === "spot" ? 1 : Math.max(1, t.leverage || 0);
              const margin =
                t.usdt ?? (lev > 1 ? (t.qty * t.entry) / lev : t.qty * t.entry);
              const qty =
                lev > 1 ? qtyFromMargin(margin, t.entry, lev) : t.qty;
              const notional = px != null ? qty * px : margin * Math.max(lev, 1);
              const uPnL =
                px != null
                  ? t.side === "long"
                    ? (px - t.entry) * qty
                    : (t.entry - px) * qty
                  : null;
              const uPct =
                uPnL != null && margin > 0 ? uPnL / margin : null;
              return (
                <article
                  key={t.id}
                  className="rounded-2xl bg-card p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">
                      {t.base}{" "}
                      <span className={t.side === "long" ? "text-long" : "text-short"}>
                        {sideLabel(t.side)}
                      </span>
                      <span className="ms-2 text-[11px] font-normal text-subtle">
                        {t.source === "manual" ? "دستی" : "سیگنال"}
                      </span>
                    </p>
                    <p
                      className={cn(
                        "font-mono text-[13px] tabular-nums",
                        uPnL != null && uPnL >= 0 ? "text-long" : "text-short",
                      )}
                      dir="ltr"
                    >
                      {uPnL == null || uPct == null
                        ? "—"
                        : `${fmtPnl(uPnL)} (${fmtPnlPct(uPct)})`}
                    </p>
                  </div>
                  <p className="mt-1 font-mono text-[12px] text-muted-foreground" dir="ltr">
                    {fmtPrice(t.entry)} → SL {fmtPrice(t.sl)} · TP {fmtPrice(t.tp1)}
                    {px != null ? ` · mark ${fmtPrice(px)}` : ""}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-subtle">
                    {t.leverage
                      ? `مارجین ${Number(margin).toFixed(4)} · اندازه ${notional.toFixed(4)} · اهرم ثبت‌شده ${t.leverage}x`
                      : "اهرم هنگام ثبت مشخص نشده؛ از ویرایش بگذار."}
                  </p>
                  <EditOpenTrade
                    trade={t}
                    last={px}
                    open={editId === t.id}
                    onToggle={() => setEditId(editId === t.id ? null : t.id)}
                  />
                  {editId === t.id ? null : sig ? (
                    <div className="mt-3">
                      <PipelineStrip pipeline={sig.pipeline} compact />
                      <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                        {sig.pipeline.reason}
                        {sig.expansion?.kind !== "none"
                          ? ` · ${expansionLabel(sig.expansion.kind, sig.expansion.bias)}`
                          : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-[12px] text-subtle">
                      تحلیل این نماد هنوز بارگذاری نشده یا در لیست اسکن نیست.
                    </p>
                  )}
                  {alert ? <ExitBanner alert={alert} /> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => setEditId(editId === t.id ? null : t.id)}
                    >
                      {editId === t.id ? "بستن ویرایش" : "ویرایش"}
                    </Button>
                    {alert?.level === "emergency" ? (
                      <Button
                        size="sm"
                        variant="short"
                        onClick={() => closeTrade(t.id, px ?? t.entry)}
                      >
                        خروج اضطراری
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => closeTrade(t.id, px ?? t.entry)}
                      >
                        بستن
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeTrade(t.id)}
                    >
                      حذف
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/pair/$symbol" params={{ symbol: t.symbol }}>
                        جزئیات
                      </Link>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {closed.length > 0 ? (
        <section className="mt-8 px-4 pb-6">
          <h2 className="mb-3 text-[13px] font-medium text-muted-foreground">
            تاریخچه
          </h2>
          <ul className="divide-y divide-border rounded-2xl bg-card shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
            {closed.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[14px] font-medium">
                    {t.base} {sideLabel(t.side)}
                    <span className="ms-2 text-[11px] font-normal text-subtle">
                      {t.source === "manual" ? "دستی" : "سیگنال"}
                    </span>
                  </p>
                  <p className="text-[11px] text-subtle">
                    {t.result === "win" ? "برد" : t.result === "loss" ? "باخت" : "سربه‌سر"}
                  </p>
                </div>
                <p
                  className={cn(
                    "font-mono text-[13px] tabular-nums",
                    (t.pnlUsd ?? 0) >= 0 ? "text-long" : "text-short",
                  )}
                  dir="ltr"
                >
                  {fmtPnl(t.pnlUsd ?? 0)}
                  {t.closePrice && t.entry
                    ? ` (${fmtPnlPct(
                        t.side === "long"
                          ? (t.closePrice - t.entry) / t.entry
                          : (t.entry - t.closePrice) / t.entry,
                      )})`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}

function ManualTradeForm({
  tickers,
}: {
  tickers: Array<{ symbol: string; price: number; change24h: number }>;
}) {
  const addTrade = useAppStore((s) => s.addTrade);
  const settings = useAppStore((s) => s.settings);
  const [open, setOpen] = useState(false);
  const [market, setMarket] = useState<MarketKind>(settings.market);
  const [raw, setRaw] = useState("");
  const [side, setSide] = useState<Side>("long");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [usdt, setUsdt] = useState(String(settings.orderUsd || 50));
  const [levStr, setLevStr] = useState(
    String(settings.leverageBySymbol[""] ?? settings.leverage ?? 5),
  );

  const symbol = resolveSymbol(raw, market);
  const last = useMemo(
    () => tickers.find((t) => t.symbol === symbol)?.price,
    [tickers, symbol],
  );

  function submit() {
    const e = Number(entry || last);
    const stop = Number(sl);
    const target = Number(tp);
    if (!symbol) {
      toast.error("نماد را بنویس؛ مثلا BTC");
      return;
    }
    if (!Number.isFinite(e) || e <= 0) {
      toast.error("ورود نامعتبر است");
      return;
    }
    if (!Number.isFinite(stop) || stop <= 0) {
      toast.error("حد ضرر لازم است");
      return;
    }
    if (side === "long" && stop >= e) {
      toast.error("برای لانگ حد ضرر باید زیر ورود باشد");
      return;
    }
    if (side === "short" && stop <= e) {
      toast.error("برای شورت حد ضرر باید بالای ورود باشد");
      return;
    }
    const margin = Number(usdt) || settings.orderUsd || 50;
    const lev = market === "spot" ? 1 : Number(levStr) || settings.leverage || 5;
    const sized = qtyFromMargin(margin, e, lev);
    if (sized <= 0) {
      toast.error("مارجین تتر نامعتبر است");
      return;
    }
    const tp1 =
      Number.isFinite(target) && target > 0
        ? target
        : side === "long"
          ? e + 1.2 * Math.abs(e - stop)
          : e - 1.2 * Math.abs(e - stop);
    addTrade({
      id: `manual-${symbol}-${Date.now()}`,
      symbol,
      base: baseFromSymbol(symbol),
      market,
      side,
      entry: e,
      sl: stop,
      tp1,
      tp2: side === "long" ? e + 2 * Math.abs(e - stop) : e - 2 * Math.abs(e - stop),
      qty: sized,
      usdt: margin,
      leverage: lev,
      takerBps: market === "spot" ? 0 : 6,
      makerBps: market === "spot" ? 0 : 2,
      riskUsd: Math.abs(e - stop) * sized,
      openedAt: Date.now(),
      source: "manual",
    });
    toast.success(`${baseFromSymbol(symbol)} ثبت شد؛ تحلیل شروع می‌شود`);
    setRaw("");
    setSl("");
    setTp("");
    setUsdt(String(settings.orderUsd || 50));
    setOpen(false);
  }

  return (
    <section className="mt-6 px-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-full items-center justify-between rounded-2xl bg-card px-4 text-[14px] font-medium shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
      >
        معامله خودم را بده
        <span className="text-muted-foreground">{open ? "بستن" : "باز"}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3 rounded-2xl bg-card p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          <p className="text-[12px] leading-5 text-muted-foreground">
            مقدار ورود را به تتر مارجین وارد کن، نه درصد. اندازه پوزیشن = مارجین × اهرم؛ مثل توبیت.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["futures", "spot"] as MarketKind[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMarket(m)}
                className={cn(
                  "h-10 rounded-lg text-[13px]",
                  market === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface text-muted-foreground",
                )}
              >
                {m === "futures" ? "فیوچرز" : "اسپات"}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted-foreground">نماد</span>
            <input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              list="nabz-symbols"
              placeholder="BTC یا ETH"
              className="h-12 w-full rounded-xl bg-surface px-3 font-mono text-[16px]"
            />
            <datalist id="nabz-symbols">
              {tickers.slice(0, 40).map((t) => (
                <option key={t.symbol} value={t.symbol} />
              ))}
            </datalist>
            {symbol ? (
              <p className="mt-1 text-[11px] text-subtle" dir="ltr">
                {symbol}
                {last != null ? ` · ${fmtPrice(last)}` : ""}
              </p>
            ) : null}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["long", "short"] as Side[]).map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setSide(x)}
                className={cn(
                  "h-10 rounded-lg text-[13px]",
                  side === x
                    ? x === "long"
                      ? "bg-long/20 text-long"
                      : "bg-short/20 text-short"
                    : "bg-surface text-muted-foreground",
                )}
              >
                {sideLabel(x)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="ورود"
              value={entry}
              placeholder={last != null ? fmtPrice(last) : "قیمت ورود"}
              onChange={setEntry}
            />
            <Field label="حد ضرر" value={sl} placeholder="الزامی" onChange={setSl} />
            <Field label="هدف (اختیاری)" value={tp} onChange={setTp} />
            <Field
              label="مارجین (تتر)"
              value={usdt}
              placeholder="مثلا ۲"
              onChange={setUsdt}
            />
            {market === "futures" ? (
              <Field label="اهرم" value={levStr} placeholder="5" onChange={setLevStr} />
            ) : null}
          </div>
          <Button className="w-full" onClick={submit}>
            ثبت و شروع تحلیل
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function EditOpenTrade({
  trade,
  last,
  open,
  onToggle,
}: {
  trade: PaperTrade;
  last?: number;
  open: boolean;
  onToggle: () => void;
}) {
  const updateTrade = useAppStore((s) => s.updateTrade);
  const [entry, setEntry] = useState(String(trade.entry));
  const [sl, setSl] = useState(String(trade.sl));
  const [tp, setTp] = useState(String(trade.tp1));
  const [usdt, setUsdt] = useState(
    String(trade.usdt ?? Math.round(trade.qty * trade.entry * 100) / 100),
  );
  const [lev, setLev] = useState(String(trade.leverage || 5));
  const [side, setSide] = useState(trade.side);

  function save() {
    const e = Number(entry);
    const stop = Number(sl);
    const target = Number(tp);
    const usd = Number(usdt);
    const leverage = trade.market === "spot" ? 1 : Number(lev) || 1;
    if (![e, stop, usd].every((n) => Number.isFinite(n) && n > 0)) {
      toast.error("ورود، حد ضرر و مارجین تتر لازم است");
      return;
    }
    if (side === "long" && stop >= e) {
      toast.error("برای لانگ حد ضرر باید زیر ورود باشد");
      return;
    }
    if (side === "short" && stop <= e) {
      toast.error("برای شورت حد ضرر باید بالای ورود باشد");
      return;
    }
    const qty = qtyFromMargin(usd, e, leverage);
    updateTrade(trade.id, {
      side,
      entry: e,
      sl: stop,
      tp1: Number.isFinite(target) && target > 0 ? target : trade.tp1,
      qty,
      usdt: usd,
      leverage,
      riskUsd: Math.abs(e - stop) * qty,
    });
    toast.success("ذخیره شد");
    onToggle();
  }

  if (!open) return null;
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-surface p-3">
      <p className="text-[13px] font-medium">ویرایش معامله</p>
      <div className="grid grid-cols-2 gap-2">
        {(["long", "short"] as Side[]).map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setSide(x)}
            className={cn(
              "h-11 rounded-lg text-[13px]",
              side === x
                ? x === "long"
                  ? "bg-long/20 text-long"
                  : "bg-short/20 text-short"
                : "bg-card text-muted-foreground",
            )}
          >
            {sideLabel(x)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="ورود" value={entry} onChange={setEntry} />
        <Field label="حد ضرر" value={sl} onChange={setSl} />
        <Field label="هدف" value={tp} onChange={setTp} />
        <Field label="مارجین تتر" value={usdt} onChange={setUsdt} />
        {trade.market !== "spot" ? (
          <Field label="اهرم" value={lev} onChange={setLev} />
        ) : null}
      </div>
      {last != null ? (
        <p className="text-[11px] text-subtle" dir="ltr">
          now {last}
        </p>
      ) : null}
      <Button type="button" className="w-full" onClick={save}>
        ذخیره تغییرات
      </Button>
    </div>
  );
}

function TransferBar() {
  const journal = useAppStore((s) => s.journal);
  const importJournal = useAppStore((s) => s.importJournal);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  function exportNow() {
    const payload = JSON.stringify({ v: 1, journal }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nabz-journal.json";
    a.click();
    URL.revokeObjectURL(url);
    void navigator.clipboard?.writeText(payload).then(
      () => toast.success("فایل ذخیره شد و در کلیپبورد هم کپی شد"),
      () => toast.success("فایل ذخیره شد"),
    );
  }

  function importNow() {
    try {
      const parsed = JSON.parse(text) as { journal?: PaperTrade[] } | PaperTrade[];
      const list = Array.isArray(parsed) ? parsed : parsed.journal;
      if (!Array.isArray(list) || list.length === 0) {
        toast.error("فایل ژورنال خالی یا نامعتبر است");
        return;
      }
      const n = importJournal(list);
      toast.success(n ? `${n} معامله اضافه شد` : "این معاملات از قبل بودند");
      setText("");
      setOpen(false);
    } catch {
      toast.error("JSON نامعتبر است");
    }
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={exportNow}>
          خروجی ژورنال
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          ورود از نسخه قبل
        </Button>
      </div>
      {open ? (
        <div className="mt-2 space-y-2">
          <p className="text-[12px] leading-5 text-subtle">
            اگر لینک جدید grok.me باز کردی، از نسخه قبلی خروجی بگیر و متن را اینجا بچسبان.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            dir="ltr"
            placeholder='{"v":1,"journal":[...]}'
            className="w-full rounded-xl bg-card px-3 py-2 font-mono text-[12px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
          />
          <Button size="sm" onClick={importNow} disabled={!text.trim()}>
            وارد کردن
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        dir="ltr"
        className="h-12 w-full rounded-xl bg-surface px-3 font-mono text-[16px]"
      />
    </label>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "long" | "short";
}) {
  return (
    <div className="rounded-xl bg-card px-3 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-[15px] font-medium tabular-nums",
          tone === "long" && "text-long",
          tone === "short" && "text-short",
        )}
        dir="ltr"
      >
        {value}
      </p>
    </div>
  );
}
