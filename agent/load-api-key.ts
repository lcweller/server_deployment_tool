/**
 * Load STEAMLINE_API_KEY from env, STEAMLINE_API_KEY_FILE, or ./steamline-agent.env
 * (one line: STEAMLINE_API_KEY=...). Helps Windows PowerShell users avoid bash `export`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadSteamlineApiKeyEarly() {
  if (process.env.STEAMLINE_API_KEY?.trim()) {
    return;
  }
  const explicit = process.env.STEAMLINE_API_KEY_FILE;
  if (explicit && existsSync(explicit)) {
    process.env.STEAMLINE_API_KEY = readFileSync(explicit, "utf8").trim();
    return;
  }
  const local = resolve(process.cwd(), "steamline-agent.env");
  if (!existsSync(local)) {
    return;
  }
  const text = readFileSync(local, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (key !== "STEAMLINE_API_KEY") {
      continue;
    }
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val.trim().length > 0) {
      process.env.STEAMLINE_API_KEY = val;
    }
    return;
  }
}
