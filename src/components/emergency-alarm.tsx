import { Link } from "@tanstack/react-router";
import { exitForFlippedSide } from "@/lib/risk";
import { useAppStore } from "@/lib/store";

export function EmergencyAlarm() {
  const journal = useAppStore((s) => s.journal);
  const lastScan = useAppStore((s) => s.lastScan);
  const open = journal.filter((t) => !t.closedAt);
  if (open.length === 0) return null;
  const bySymbol = new Map(lastScan?.signals.map((s) => [s.symbol, s]) ?? []);
  const hits = open.flatMap((t) => {
    const sig = bySymbol.get(t.symbol);
    const flipped = sig ? exitForFlippedSide(t.side, sig.side) : null;
    const alert =
      flipped ?? (sig && sig.side === t.side && sig.exitAlert.on ? sig.exitAlert : null);
    if (!alert || alert.level === "none") return [];
    return [{ trade: t, alert }];
  });
  if (hits.length === 0) return null;
  const emergency = hits.some((h) => h.alert.level === "emergency");
  const names = hits.map((h) => h.trade.base).join("، ");

  return (
    <div
      className={
        emergency
          ? "bg-short px-4 py-3 text-[13px] leading-6 text-white"
          : "bg-card px-4 py-3 text-[13px] leading-6 text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
      }
    >
      <p className="font-medium">
        {emergency ? "خروج اضطراری" : "احتیاط"} · {names}
      </p>
      <p className={emergency ? "mt-1 text-white/85" : "mt-1 text-muted-foreground"}>
        {emergency
          ? "ستاپ معامله باز دیگر معتبر نیست. این هشدار جدا از حد ضرر است — روی توبیت خودت ببند."
          : "ساختار ضعیف شده. اگر داخل معامله هستی برای خروج آماده باش."}
      </p>
      <Link
        to="/journal"
        className="mt-2 inline-flex h-10 items-center text-[13px] font-medium underline-offset-4 hover:underline"
      >
        رفتن به ژورنال
      </Link>
    </div>
  );
}
