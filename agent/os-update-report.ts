/**
 * One-shot OS update status for the control plane (optional).
 * Write JSON to ~/.steamline/os-update-report.json (or STEAMLINE_OS_UPDATE_REPORT_FILE);
 * the next heartbeat consumes and deletes the file so notifications fire once.
 */
import * as fs from "node:fs";

import { steamlineInstallRoot } from "./steamline-install-path";

export type OsUpdateReportPayload = {
  outcome: "applied" | "failed" | "skipped" | "available";
  detail?: string;
};

function reportPath(): string {
  const env = process.env.STEAMLINE_OS_UPDATE_REPORT_FILE?.trim();
  if (env) {
    return env;
  }
  return `${steamlineInstallRoot()}/os-update-report.json`;
}

export function consumeOsUpdateReport(): OsUpdateReportPayload | undefined {
  const p = reportPath();
  try {
    if (!fs.existsSync(p)) {
      return undefined;
    }
    const raw = fs.readFileSync(p, "utf8");
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
    const j = JSON.parse(raw) as Record<string, unknown>;
    const outcome = j.outcome;
    if (
      outcome !== "applied" &&
      outcome !== "failed" &&
      outcome !== "skipped" &&
      outcome !== "available"
    ) {
      return undefined;
    }
    const detail =
      typeof j.detail === "string" && j.detail.length > 0 ? j.detail.slice(0, 2000) : undefined;
    return { outcome, detail };
  } catch {
    return undefined;
  }
}
