/**
 * Persistent WebSocket to the control plane (primary channel). REST heartbeat is the fallback.
 */
import WebSocket from "ws";

import type { HeartbeatJson } from "./heartbeat-types";

export type AgentWsCallbacks = {
  onHeartbeatResponse: (data: HeartbeatJson) => void;
  onControl?: (msg: Record<string, unknown>) => void;
  onConnectionChange: (connected: boolean) => void;
};

function toAgentWsUrl(baseUrl: string): string {
  const u = new URL(baseUrl.replace(/\/$/, ""));
  const wsProto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${u.host}/api/v1/agent/ws`;
}

const DEFAULT_INTERVAL_MS = 2500;
const MAX_BACKOFF_MS = 60_000;

export class AgentWebSocketClient {
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 2000;
  private stopped = false;
  private lastConnectAttempt = 0;
  private buildPayload: () => Promise<Record<string, unknown>>;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly callbacks: AgentWsCallbacks,
    buildPayload: () => Promise<Record<string, unknown>>
  ) {
    this.buildPayload = buildPayload;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.callbacks.onConnectionChange(false);
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /** Send non-heartbeat JSON (e.g. terminal PTY output) on the same connection. */
  sendAuxiliaryJson(obj: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      this.ws.send(JSON.stringify(obj));
    } catch {
      /* ignore */
    }
  }

  private connect(): void {
    if (this.stopped) {
      return;
    }
    const url = toAgentWsUrl(this.baseUrl);
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    this.ws = ws;

    ws.on("open", () => {
      this.backoffMs = 2000;
      this.callbacks.onConnectionChange(true);
      this.startHeartbeatLoop();
    });

    ws.on("message", (data) => {
      try {
        const text = data.toString();
        const j = JSON.parse(text) as Record<string, unknown>;
        if (j.type === "control") {
          this.callbacks.onControl?.(j);
          return;
        }
        if (j.type === "ack") {
          return;
        }
        if (j.ok === true) {
          this.callbacks.onHeartbeatResponse(j as HeartbeatJson);
        }
      } catch {
        /* ignore malformed */
      }
    });

    ws.on("close", () => {
      this.ws = null;
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.callbacks.onConnectionChange(false);
      this.scheduleReconnect();
    });

    ws.on("error", () => {
      /* close event follows */
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) {
      return;
    }
    const delay = Math.min(this.backoffMs, MAX_BACKOFF_MS);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeatLoop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    const interval = Math.max(
      1500,
      Number(process.env.STEAMLINE_WS_HEARTBEAT_INTERVAL_MS) || DEFAULT_INTERVAL_MS
    );
    void this.sendHeartbeatPayload();
    this.timer = setInterval(() => {
      void this.sendHeartbeatPayload();
    }, interval);
  }

  private sendHeartbeatPayload(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    void (async () => {
      try {
        const body = await this.buildPayload();
        this.ws?.send(JSON.stringify(body));
      } catch {
        /* ignore */
      }
    })();
  }
}
