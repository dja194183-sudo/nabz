import { entryStateLabel, exitLevelLabel } from "@/lib/format";
import type { EntryState, ExitAlert } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StretchBanner({
  state,
  stretchAtr,
}: {
  state: EntryState;
  stretchAtr: number;
}) {
  if (state === "ready") return null;
  const far = state === "stretched";
  return (
    <div
      className={cn(
        "mt-3 rounded-xl px-3 py-3 text-[13px] leading-6",
        far
          ? "bg-short/10 text-short"
          : "bg-surface text-muted-foreground",
      )}
    >
      <p className="font-medium text-foreground">{entryStateLabel(state)}</p>
      <p className="mt-1">
        قیمت حدود {stretchAtr.toFixed(1)} برابر ATR از ورود فاصله گرفته. ورود فوری
        توصیه نمی‌شود؛ صبر کن تا به محدوده ورود برگردد.
      </p>
    </div>
  );
}

export function ExitBanner({ alert }: { alert: ExitAlert }) {
  if (!alert.on) return null;
  const emergency = alert.level === "emergency";
  return (
    <div
      className={cn(
        "mt-3 rounded-xl px-3 py-3 text-[13px] leading-6",
        emergency ? "bg-short/15 text-short" : "bg-surface text-muted-foreground",
      )}
    >
      <p className="font-medium text-foreground">{exitLevelLabel(alert.level)}</p>
      <p className="mt-1">
        {emergency
          ? "ستاپ دیگر معتبر نیست. این هشدار جدا از حد ضرر و هدف است؛ اگر داخل معامله هستی، خروج را جدی بگیر."
          : "ساختار ضعیف شده. اگر داخل معامله هستی حجم را کم کن یا برای خروج آماده باش."}
      </p>
      <ul className="mt-2 space-y-1">
        {alert.reasons.map((r) => (
          <li key={r}>· {r}</li>
        ))}
      </ul>
    </div>
  );
}
