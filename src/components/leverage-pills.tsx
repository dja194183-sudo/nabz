import { levChoices } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function LeveragePills({
  symbol,
  max,
  value,
  onPick,
  title,
}: {
  symbol?: string;
  max?: number | null;
  value?: number;
  onPick?: (n: number) => void;
  title?: string;
}) {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const cap = max && max > 0 ? max : 50;
  const options = levChoices(cap);
  const current =
    value ??
    (symbol
      ? Math.min(cap, settings.leverageBySymbol[symbol] ?? settings.leverage)
      : Math.min(cap, settings.leverage));

  function pick(n: number) {
    if (onPick) onPick(n);
    else if (symbol) {
      setSettings({
        leverageBySymbol: { ...settings.leverageBySymbol, [symbol]: n },
      });
    } else {
      setSettings({ leverage: n });
    }
  }

  if (options.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-[12px] text-muted-foreground">
        {title ??
          (symbol
            ? `اهرم این معامله${max ? ` · سقف توبیت ${max}x` : ""}`
            : "اهرم پیش‌فرض")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => pick(n)}
            className={cn(
              "h-10 min-w-12 rounded-lg px-2 text-[13px] font-medium",
              current === n
                ? "bg-primary text-primary-foreground"
                : "bg-surface text-muted-foreground",
            )}
          >
            {n}x
          </button>
        ))}
      </div>
    </div>
  );
}
