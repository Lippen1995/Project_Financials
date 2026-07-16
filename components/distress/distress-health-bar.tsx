import { formatScore, getHealthColor } from "@/lib/distress-presentation";

/**
 * The financial-health meter. A null score is a real and common outcome — roughly half the distress
 * universe has no usable regnskap — so it renders as an explicit gap rather than an empty bar,
 * which would read as "scored zero".
 */
export function DistressHealthBar({ health }: { health?: number | null }) {
  const color = getHealthColor(health);
  const hasScore = health !== null && health !== undefined;

  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 min-w-[70px] max-w-[110px] flex-1 overflow-hidden rounded-full bg-[rgba(15,23,42,0.06)]">
        {hasScore ? (
          <div className="h-full rounded-full" style={{ width: `${health}%`, background: color }} />
        ) : null}
      </div>
      <span
        className="w-6 shrink-0 text-right text-[13px] font-semibold tabular-nums"
        style={{ color }}
        title={hasScore ? undefined : "Ingen regnskapstall å score på"}
      >
        {formatScore(health)}
      </span>
    </div>
  );
}
