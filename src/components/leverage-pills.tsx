import { levChoices } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function LeveragePills({
  symbol,
  max = 50,
}: {
  symbol?: string;
  max?: number;
}) {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const options = levChoices(max);
  const current = symbol
    ? Math.min(max, settings.leverageBySymbol[symbol] ?? settings.leverage)
    : Math.min(max, settings.leverage);

  function pick(n: number) {
    if (symbol) {
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
        اهرم {symbol ? `این نماد · سقف توبیت ${max}x` : "پیش‌فرض"}
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
