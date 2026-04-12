/**
 * Lightweight, user-facing hints from recent game/agent log lines.
 * High-signal patterns only; avoids alarming or technical raw dumps.
 */

export type LogInsights = {
  severity: "warn" | "info";
  bullets: string[];
};

type Rule = {
  id: string;
  severity: "warn" | "info";
  test: RegExp;
  message: string;
};

const RULES: Rule[] = [
  {
    id: "bind",
    severity: "warn",
    test: /address already in use|eaddrinuse|bind failed|failed to bind|could not bind|couldn't bind|failed to allocate.*socket/i,
    message:
      "The server may not be listening on the expected port (bind or port conflict). Check that nothing else is using the game or query port.",
  },
  {
    id: "steam_auth",
    severity: "warn",
    test: /logon failed|invalid password|authentication failed|steam.*(?:denied|rejected)|not logged on|no license|invalid.*ticket/i,
    message:
      "Steam or login validation may have failed. Confirm the app is owned on this account and any server password or GSLT settings match your intent.",
  },
  {
    id: "steamcmd",
    severity: "warn",
    test: /steamcmd.*(?:failed|error)|app_update.*failed|update state.*failure|download failed/i,
    message:
      "SteamCMD reported a problem while installing or updating files. A retry or disk-space check on the host may help.",
  },
  {
    id: "loader",
    severity: "warn",
    test: /cannot execute|required file not found|no such file|ld-linux|error while loading shared libraries/i,
    message:
      "A required binary or library may be missing on the host. The game’s Linux runtime or dependencies might need to be installed.",
  },
  {
    id: "crash",
    severity: "warn",
    test: /segmentation fault|sigsegv|sigabrt|access violation|core dumped|assertion failed|fatal error/i,
    message:
      "The game process may have crashed or aborted. If this keeps happening, try fewer mods, more RAM, or a clean reinstall from the catalog.",
  },
  {
    id: "memory",
    severity: "warn",
    test: /\bout of memory\b|std::bad_alloc|java heap space|cannot allocate memory/i,
    message:
      "Logs mention running out of memory. Consider more RAM, lowering player slots, or lighter mods.",
  },
  {
    id: "vac",
    severity: "info",
    test: /\bVAC\b|secure mode|insecure mode/i,
    message:
      "VAC or “secure mode” messages appeared — often informational. Friends can still connect if the server is reachable and listed.",
  },
];

const MAX_BULLETS = 4;

/**
 * Scans log lines newest-first so recent issues take priority when matching rules.
 */
export function analyzeRecentLogLines(lines: string[]): LogInsights | null {
  const seen = new Set<string>();
  const hits: { severity: "warn" | "info"; message: string }[] = [];

  for (const raw of lines) {
    const line = typeof raw === "string" ? raw.trim() : "";
    if (line.length < 4 || line.length > 12_000) {
      continue;
    }
    for (const rule of RULES) {
      if (seen.has(rule.id)) {
        continue;
      }
      if (rule.test.test(line)) {
        seen.add(rule.id);
        hits.push({ severity: rule.severity, message: rule.message });
        break;
      }
    }
    if (hits.length >= MAX_BULLETS) {
      break;
    }
  }

  if (hits.length === 0) {
    return null;
  }

  const warns = hits.filter((h) => h.severity === "warn");
  const infos = hits.filter((h) => h.severity === "info");
  const ordered = [...warns, ...infos].slice(0, MAX_BULLETS);
  const severity = ordered.some((h) => h.severity === "warn") ? "warn" : "info";

  return {
    severity,
    bullets: ordered.map((h) => h.message),
  };
}
