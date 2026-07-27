import { cn } from "@/lib/utils";

type NjordMarkProps = {
  className?: string;
};

export function NjordMark({ className }: NjordMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block shrink-0 overflow-hidden rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] bg-no-repeat",
        className,
      )}
      style={{
        backgroundImage: 'url("/brand/njord.jpg")',
        backgroundPosition: "50% 10%",
        backgroundSize: "156%",
      }}
    />
  );
}
