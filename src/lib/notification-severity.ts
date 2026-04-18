/**
 * Maps persisted notification severity to UI badge variants and dot colors.
 */
export function notificationSeverityBadgeVariant(severity: string) {
  switch (severity) {
    case "critical":
    case "error":
      return "destructive" as const;
    case "warning":
      return "warning" as const;
    case "success":
      return "success" as const;
    default:
      return "info" as const;
  }
}

export function notificationSeverityDotClass(severity: string) {
  switch (severity) {
    case "critical":
    case "error":
      return "bg-red-500";
    case "warning":
      return "bg-amber-500";
    case "success":
      return "bg-emerald-500";
    default:
      return "bg-sky-500";
  }
}
