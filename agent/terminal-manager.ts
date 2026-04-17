/**
 * Remote terminal: one PTY per session (Linux + root). Requires `node-pty` in
 * `~/.steamline/node_modules` (installed by install-agent.sh).
 */
import { createRequire } from "node:module";
import * as path from "node:path";

import { steamlineInstallRoot } from "./steamline-install-path";

const IDLE_MS =
  Math.max(
    60_000,
    Number(process.env.STEAMLINE_TERMINAL_IDLE_MS) || 30 * 60 * 1000
  );
const MAX_SESSIONS = 5;

type IPty = {
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (code: number, signal?: number) => void) => void;
  write: (data: string) => void;
  resize: (columns: number, rows: number) => void;
  kill: () => void;
};

type PtyModule = {
  spawn: (
    file: string,
    args: string[],
    opt: Record<string, unknown>
  ) => IPty;
};

let upstream: ((o: Record<string, unknown>) => void) | null = null;

export function setTerminalUpstream(
  fn: ((o: Record<string, unknown>) => void) | null
): void {
  upstream = fn;
}

function sendUplink(o: Record<string, unknown>): void {
  upstream?.(o);
}

function loadPty(): PtyModule | null {
  try {
    const anchor = path.join(steamlineInstallRoot(), "steamline-agent.cjs");
    const req = createRequire(anchor);
    return req("node-pty") as PtyModule;
  } catch {
    return null;
  }
}

type Session = {
  pty: IPty;
  idleTimer: ReturnType<typeof setTimeout> | null;
};

const sessions = new Map<string, Session>();

function clearIdle(s: Session): void {
  if (s.idleTimer) {
    clearTimeout(s.idleTimer);
    s.idleTimer = null;
  }
}

function bumpIdle(sessionId: string, s: Session): void {
  clearIdle(s);
  s.idleTimer = setTimeout(() => {
    closeSession(sessionId, "idle timeout");
  }, IDLE_MS);
}

function closeSession(sessionId: string, reason?: string): void {
  const s = sessions.get(sessionId);
  if (!s) {
    return;
  }
  clearIdle(s);
  try {
    s.pty.kill();
  } catch {
    /* ignore */
  }
  sessions.delete(sessionId);
  if (reason) {
    console.error(`[steamline] terminal session ${sessionId}: ${reason}`);
  }
}

function sendError(sessionId: string, message: string): void {
  sendUplink({ type: "terminal_error", sessionId, message });
}

export function handleTerminalControl(msg: Record<string, unknown>): void {
  if (msg.type !== "control" || msg.channel !== "terminal") {
    return;
  }
  const action = msg.action as string | undefined;
  const sessionId = msg.sessionId as string | undefined;
  if (!action || !sessionId) {
    return;
  }

  if (process.platform !== "linux") {
    if (action === "open") {
      sendError(sessionId, "Remote terminal is only available on Linux hosts.");
    }
    return;
  }

  const euid = typeof process.geteuid === "function" ? process.geteuid() : -1;
  if (euid !== 0) {
    if (action === "open") {
      sendError(
        sessionId,
        "Remote terminal requires the agent to run as root (reinstall with sudo or use the standard installer)."
      );
    }
    return;
  }

  if (action === "open") {
    if (sessions.size >= MAX_SESSIONS) {
      sendError(sessionId, "Too many terminal sessions on this host (max 5).");
      return;
    }
    const cols = Math.min(
      256,
      Math.max(40, Number(msg.cols) || 120)
    );
    const rows = Math.min(
      200,
      Math.max(8, Number(msg.rows) || 32)
    );
    const ptyMod = loadPty();
    if (!ptyMod) {
      sendError(
        sessionId,
        "node-pty is not installed. Re-run the install script or run: npm install node-pty in ~/.steamline"
      );
      return;
    }
    try {
      const pty = ptyMod.spawn("/bin/bash", ["-l"], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: process.env.HOME || "/root",
        env: process.env as { [key: string]: string },
      });
      const s: Session = { pty, idleTimer: null };
      sessions.set(sessionId, s);
      bumpIdle(sessionId, s);
      pty.onData((data) => {
        const sess = sessions.get(sessionId);
        if (!sess) {
          return;
        }
        bumpIdle(sessionId, sess);
        const b64 = Buffer.from(data, "utf8").toString("base64");
        sendUplink({ type: "terminal_data", sessionId, base64: b64 });
      });
      pty.onExit(() => {
        sessions.delete(sessionId);
      });
    } catch (e) {
      sendError(
        sessionId,
        `Could not start shell: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    return;
  }

  const s = sessions.get(sessionId);
  if (!s) {
    return;
  }

  if (action === "stdin" && typeof msg.text === "string") {
    bumpIdle(sessionId, s);
    try {
      s.pty.write(msg.text);
    } catch {
      closeSession(sessionId, "stdin write failed");
    }
    return;
  }

  if (action === "resize") {
    const cols = Number(msg.cols);
    const rows = Number(msg.rows);
    if (Number.isFinite(cols) && Number.isFinite(rows)) {
      try {
        s.pty.resize(
          Math.min(256, Math.max(40, Math.floor(cols))),
          Math.min(200, Math.max(8, Math.floor(rows)))
        );
      } catch {
        /* ignore */
      }
    }
    return;
  }

  if (action === "close") {
    closeSession(sessionId);
  }
}

export function shutdownAllTerminalSessions(): void {
  for (const id of [...sessions.keys()]) {
    closeSession(id);
  }
}
