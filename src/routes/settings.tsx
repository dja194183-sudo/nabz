import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { LeveragePills } from "@/components/leverage-pills";
import { Button } from "@/components/ui/button";
import { loadVault, saveVault } from "@/lib/server/vault";
import { testToobitKeys } from "@/lib/server/toobit-trade";
import { useAppStore } from "@/lib/store";
import type { MarketKind, Timeframe } from "@/lib/types";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  ssr: false,
  component: SettingsPage,
});

function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const wrFilter = useAppStore((s) => s.wrFilter);
  const setWrFilter = useAppStore((s) => s.setWrFilter);

  return (
    <AppShell>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <h1 className="text-[24px] font-semibold tracking-tight">تنظیمات</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          اسکن و حجم پیشنهادی همین‌جا تنظیم می‌شود. ارسال سفارش فقط اگر کلید API بگذاری و خودت تأیید کنی.
        </p>
      </header>

      <section className="mt-6 space-y-6 px-4">
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-muted-foreground">
            بازار
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(["futures", "spot"] as MarketKind[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSettings({ market: m })}
                className={cn(
                  "h-12 rounded-xl text-[14px] font-medium",
                  settings.market === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
                )}
              >
                {m === "futures" ? "فیوچرز" : "اسپات"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px] leading-5 text-subtle">
            اسپات همان زنجیره را روی جفت USDT نقدی اجرا می‌کند؛ فاندینگ و اهرم ندارد.
          </p>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-muted-foreground">
            تایم‌فریم نمودار
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(["1h", "15m"] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setSettings({ timeframe: tf })}
                className={cn(
                  "h-12 rounded-xl text-[14px] font-medium",
                  settings.timeframe === tf
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
                )}
              >
                {tf === "1h" ? "۱ ساعته" : "۱۵ دقیقه"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px] leading-5 text-subtle">
            سیگنال همیشه از زنجیره 4H → 1H → 15M → 5M ساخته می‌شود. این گزینه فقط نمودار صفحه جزئیات را عوض می‌کند.
          </p>
        </fieldset>

        <NumberField
          label="سرمایه (USDT)"
          value={settings.capital}
          min={10}
          max={1_000_000}
          step={10}
          onChange={(capital) => setSettings({ capital })}
        />
        <p className="-mt-4 text-[12px] leading-5 text-subtle">
          موجودی حساب برای نمایش است.
        </p>
        <NumberField
          label="حجم ورود (تتر)"
          value={settings.orderUsd}
          min={1}
          max={100_000}
          step={1}
          onChange={(orderUsd) => setSettings({ orderUsd })}
        />
        <p className="-mt-4 text-[12px] leading-5 text-subtle">
          مقدار ورود به تتر است، نه درصد. پیش‌فرض ۵۰ تتر.
        </p>
        <NumberField
          label="ریسک هر معامله (٪)"
          value={settings.riskPct}
          min={0.25}
          max={5}
          step={0.25}
          onChange={(riskPct) => setSettings({ riskPct })}
        />
        <LeveragePills max={200} />
        <p className="-mt-2 text-[12px] leading-5 text-subtle">
          این پیش‌فرض است. سقف واقعی هر ارز در صفحه همان نماد از توبیت خوانده می‌شود.
        </p>
        <NumberField
          label="حداقل وین‌ریت بک‌تست (٪)"
          value={settings.minWinRate}
          min={0}
          max={80}
          step={1}
          onChange={(minWinRate) => setSettings({ minWinRate })}
        />

        <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-card px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          <span className="text-[14px]">فیلتر وین‌ریت روی سیگنال‌ها</span>
          <input
            type="checkbox"
            checked={wrFilter}
            onChange={(e) => setWrFilter(e.target.checked)}
            className="size-5 accent-primary"
          />
        </label>

        <ApiKeys />

        <VaultBox />

        <div className="rounded-2xl bg-card p-4 text-[13px] leading-6 text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          <p className="font-medium text-foreground">روش NABZ</p>
          <p className="mt-2">
            جهت از روند ۴ساعته و ۱ساعته، ستاپ از ۱۵دقیقه، تأیید ورود از ۵دقیقه.
            ورودِ چاپ‌شده حداقل یک دقیقه قفل می‌ماند. اگر قیمت از ورود دور شود
            وضعیت «منتظر پولبک» یا «فاصله گرفته» می‌شود و ورود فوری توصیه نمی‌شود.
            اگر داخل معامله باشی و ساختار بشکند، هشدار خروج اضطراری جدا از حد ضرر
            می‌آید. حد ضرر فقط به نفع معامله جابه‌جا می‌شود؛ اهداف ثابت‌اند.
          </p>
          <p className="mt-3 font-mono text-[12px] text-subtle" dir="ltr">
            NABZ v{APP_VERSION}
          </p>
        </div>
      </section>
    </AppShell>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-medium text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        dir="ltr"
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="h-12 w-full rounded-xl bg-card px-4 font-mono text-[16px] tabular-nums shadow-[0_0_0_1px_rgba(255,255,255,0.08)] outline-none focus:shadow-[0_0_0_1px_rgba(255,255,255,0.18)]"
      />
    </label>
  );
}

function ApiKeys() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const test = useMutation({
    mutationFn: () =>
      testToobitKeys({
        data: {
          apiKey: settings.apiKey,
          secret: settings.apiSecret,
          market: settings.market,
        },
      }),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "اتصال نشد"),
  });
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium text-muted-foreground">
        کلید API توبیت
      </legend>
      <p className="mb-3 text-[12px] leading-5 text-subtle">
        فقط مجوز معامله بده، برداشت را خاموش کن. محدودیت IP اگر روشن باشد از این
        سرور رد می‌شود. کلید روی همین دستگاه ذخیره می‌شود و برای هر سفارش یک‌بار
        جهت امضا به سرور می‌رود — ربات خودکار نیست.
      </p>
      <label className="mb-2 block">
        <span className="mb-2 block text-[13px] text-muted-foreground">API Key</span>
        <input
          value={settings.apiKey}
          onChange={(e) => setSettings({ apiKey: e.target.value.trim() })}
          autoComplete="off"
          dir="ltr"
          className="h-12 w-full rounded-xl bg-card px-4 font-mono text-[16px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)] outline-none"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-[13px] text-muted-foreground">Secret</span>
        <input
          type="password"
          value={settings.apiSecret}
          onChange={(e) => setSettings({ apiSecret: e.target.value.trim() })}
          autoComplete="off"
          dir="ltr"
          className="h-12 w-full rounded-xl bg-card px-4 font-mono text-[16px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)] outline-none"
        />
      </label>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={test.isPending || !settings.apiKey || !settings.apiSecret}
          onClick={() => test.mutate()}
        >
          {test.isPending ? "در حال تست…" : "تست اتصال"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSettings({ apiKey: "", apiSecret: "" })}
        >
          پاک کردن کلید
        </Button>
      </div>
    </fieldset>
  );
}

function VaultBox() {
  const vaultId = useAppStore((s) => s.vaultId);
  const setVaultId = useAppStore((s) => s.setVaultId);
  const journal = useAppStore((s) => s.journal);
  const watchlist = useAppStore((s) => s.watchlist);
  const lastScan = useAppStore((s) => s.lastScan);
  const replaceVault = useAppStore((s) => s.replaceVault);
  const [code, setCode] = useState("");

  const push = useMutation({
    mutationFn: () =>
      saveVault({
        data: {
          id: vaultId,
          payload: JSON.stringify({ v: 1, journal, watchlist, lastScan }),
        },
      }),
    onSuccess: () => toast.success("روی سرور ذخیره شد"),
    onError: () => toast.error("سرور ذخیره نکرد"),
  });

  const pull = useMutation({
    mutationFn: async () => {
      const id = (code.trim() || vaultId).toUpperCase();
      const res = await loadVault({ data: { id } });
      if (!res.ok) throw new Error(res.error);
      return { id, parsed: JSON.parse(res.payload) };
    },
    onSuccess: ({ id, parsed }) => {
      setVaultId(id);
      replaceVault(parsed);
      toast.success("از سرور برگشت");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "بازیابی نشد"),
  });

  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium text-muted-foreground">
        ذخیره گوشی و سرور
      </legend>
      <p className="mb-3 text-[12px] leading-5 text-subtle">
        ژورنال و آخرین سیگنال‌ها روی همین گوشی می‌مانند و با این کد روی سرور برنامه هم کپی می‌شوند. این کد را جایی یادداشت کن.
      </p>
      <p className="mb-2 font-mono text-[16px] text-foreground" dir="ltr">
        {vaultId}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(vaultId);
            toast.success("کد کپی شد");
          }}
        >
          کپی کد
        </Button>
        <Button size="sm" disabled={push.isPending} onClick={() => push.mutate()}>
          {push.isPending ? "…" : "ذخیره روی سرور"}
        </Button>
      </div>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="کد دستگاه دیگر"
        dir="ltr"
        className="mt-3 h-12 w-full rounded-xl bg-card px-4 font-mono text-[16px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)] outline-none"
      />
      <Button
        className="mt-2 w-full"
        variant="outline"
        disabled={pull.isPending}
        onClick={() => pull.mutate()}
      >
        بازیابی از سرور
      </Button>
    </fieldset>
  );
}
