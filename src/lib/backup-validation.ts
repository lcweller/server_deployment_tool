/**
 * Shared backup policy / schedule validation for UI and API (Zod uses the same regexes).
 */

export const BACKUP_UTC_HM_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** Weekday 0–6, then HH:mm UTC — e.g. 1:02:00 for Monday 02:00 */
export const BACKUP_UTC_WEEKLY_EXPR_REGEX =
  /^[0-6]:([01]?\d|2[0-3]):[0-5]\d$/;

export const MSG_DAILY_TIME_UTC = "Daily time must be HH:mm in 24-hour UTC (e.g. 02:30).";
export const MSG_WEEKLY_SCHEDULE =
  "Weekly schedule needs a weekday and HH:mm UTC (e.g. Monday at 02:00).";
export const MSG_INSTANCE_FOR_SCHEDULE =
  "Pick a game server instance for scheduled backups.";
export const MSG_KEEP_LAST = "Keep last N must be a whole number ≥ 1.";
export const MSG_KEEP_DAYS = "Keep days must be a whole number ≥ 1.";

export function isUtcHm(s: string): boolean {
  return BACKUP_UTC_HM_REGEX.test(s.trim());
}

/** Build `dow:HH:mm` for API; returns null if time is invalid. */
export function weeklyExprFromUi(dow: string, timeHm: string): string | null {
  const raw = (timeHm || "02:00").split(":");
  const hh = raw[0] ?? "02";
  const mm = raw[1] ?? "00";
  if (!isUtcHm(`${hh}:${mm}`)) return null;
  return `${dow}:${hh}:${mm}`;
}

export function isWeeklyExpr(dow: string, timeHm: string): boolean {
  const expr = weeklyExprFromUi(dow, timeHm);
  return expr !== null && BACKUP_UTC_WEEKLY_EXPR_REGEX.test(expr);
}

export type PolicyFormScheduleMode =
  | "manual"
  | "hourly"
  | "daily"
  | "weekly"
  | "custom";

export type PolicyFormValidationInput = {
  scheduleMode: PolicyFormScheduleMode;
  /** Selected instance id, or empty for none */
  policyInstanceId: string;
  dailyTime: string;
  weeklyDow: string;
  weeklyTime: string;
  keepLast: string;
  keepDays: string;
};

export type PolicyFormValidationResult =
  | { ok: true; keepLast?: number; keepDays?: number }
  | { ok: false; message: string };

/** Validates the same rules as the backups API Zod schemas for policy rows. */
export function validatePolicyForm(
  input: PolicyFormValidationInput
): PolicyFormValidationResult {
  const {
    scheduleMode,
    policyInstanceId,
    dailyTime,
    weeklyDow,
    weeklyTime,
    keepLast,
    keepDays,
  } = input;

  if (!policyInstanceId && scheduleMode !== "manual" && scheduleMode !== "custom") {
    return { ok: false, message: MSG_INSTANCE_FOR_SCHEDULE };
  }
  if (scheduleMode === "daily" && !isUtcHm(dailyTime.trim() || "02:00")) {
    return { ok: false, message: MSG_DAILY_TIME_UTC };
  }
  if (scheduleMode === "weekly" && !isWeeklyExpr(weeklyDow, weeklyTime)) {
    return { ok: false, message: MSG_WEEKLY_SCHEDULE };
  }

  const klRaw = keepLast.trim();
  const kdRaw = keepDays.trim();
  if (
    klRaw &&
    (!Number.isFinite(Number(klRaw)) ||
      Number(klRaw) < 1 ||
      !Number.isInteger(Number(klRaw)))
  ) {
    return { ok: false, message: MSG_KEEP_LAST };
  }
  if (
    kdRaw &&
    (!Number.isFinite(Number(kdRaw)) ||
      Number(kdRaw) < 1 ||
      !Number.isInteger(Number(kdRaw)))
  ) {
    return { ok: false, message: MSG_KEEP_DAYS };
  }

  return {
    ok: true,
    keepLast: klRaw ? Number(klRaw) : undefined,
    keepDays: kdRaw ? Number(kdRaw) : undefined,
  };
}
