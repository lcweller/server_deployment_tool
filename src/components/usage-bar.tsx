import { cn } from "@/lib/utils";

type UsageBarProps = {
  label: string;
  /** 0–100 */
  percent: number;
  detail?: string;
  /** Pulse when “live” (e.g. recent heartbeat) */
  pulse?: boolean;
  className?: string;
};

export function UsageBar({
  label,
  percent,
  detail,
  pulse,
  className,
}: UsageBarProps) {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">{label}</span>
        {detail ? (
          <span className="tabular-nums text-muted-foreground">{detail}</span>
        ) : null}
      </div>
      <div
        className={cn(
          "h-2.5 w-full overflow-hidden rounded-full bg-muted",
          pulse && "ring-1 ring-primary/25"
        )}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-[width] duration-500 ease-out"
          style={{ width: `${p}%` }}
        />
      </div>
      <div className="text-[11px] tabular-nums text-muted-foreground">{p}%</div>
    </div>
  );
}
