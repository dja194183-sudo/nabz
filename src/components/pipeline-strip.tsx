import type { Pipeline } from "@/lib/types";
import { regimeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEPS: Array<{ key: keyof Pick<Pipeline, "h4" | "h1" | "m15" | "m5">; tf: string }> = [
  { key: "h4", tf: "4H" },
  { key: "h1", tf: "1H" },
  { key: "m15", tf: "15M" },
  { key: "m5", tf: "5M" },
];

function tone(v: string) {
  if (v === "bull" || v === "long") return "text-long bg-long/10";
  if (v === "bear" || v === "short") return "text-short bg-short/10";
  return "text-muted-foreground bg-surface";
}

export function PipelineStrip({
  pipeline,
  compact = false,
}: {
  pipeline: Pipeline;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-4 gap-1.5", compact && "gap-1")}>
      {STEPS.map((s) => {
        const v = pipeline[s.key];
        return (
          <div
            key={s.tf}
            className={cn(
              "rounded-lg px-1.5 py-1.5 text-center",
              tone(v),
            )}
          >
            <p className="text-[10px] text-muted-foreground">{s.tf}</p>
            <p className={cn("text-[11px] font-medium", compact && "text-[10px]")}>
              {regimeLabel(v)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
