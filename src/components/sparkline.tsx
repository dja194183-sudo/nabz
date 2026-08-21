export function Sparkline({
  values,
  up,
  className,
}: {
  values: number[];
  up: boolean;
  className?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 72;
  const h = 28;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      width={w}
      height={h}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={up ? "var(--color-long)" : "var(--color-short)"}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
