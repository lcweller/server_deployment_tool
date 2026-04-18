import { cn } from "@/lib/utils";

const toneClass: Record<
  "online" | "offline" | "warning" | "error" | "info" | "neutral",
  string
> = {
  online: "bg-emerald-500 shadow-[0_0_0_2px] shadow-emerald-500/30",
  offline: "bg-slate-500",
  warning: "bg-amber-500 shadow-[0_0_0_2px] shadow-amber-500/25",
  error: "bg-red-500 shadow-[0_0_0_2px] shadow-red-500/25",
  info: "bg-sky-500 shadow-[0_0_0_2px] shadow-sky-500/25",
  neutral: "bg-slate-400",
};

type Props = {
  status: keyof typeof toneClass;
  className?: string;
  /** Accessible label; defaults to status. */
  label?: string;
};

/**
 * 8px status indicator — use next to host/server labels for consistent semantics.
 */
export function StatusDot({ status, className, label }: Props) {
  return (
    <span
      role="img"
      aria-label={label ?? status}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        toneClass[status],
        className
      )}
    />
  );
}
