import { EventEmitter } from "node:events";

export type HostRealtimePayload = {
  hostId: string;
  kind:
    | "heartbeat"
    | "metrics"
    | "instances"
    | "agent_update"
    | "backup_update"
    | "notifications";
};

const emitter = new EventEmitter();
emitter.setMaxListeners(500);

function channel(userId: string) {
  return `host:${userId}`;
}

/**
 * Notify connected dashboard SSE clients that a host changed (heartbeat, metrics, agent
 * updates, or server-side mutations that call `notify-dashboard.ts`).
 */
export function publishHostRealtime(userId: string, payload: HostRealtimePayload): void {
  emitter.emit(channel(userId), payload);
}

export function subscribeHostRealtime(
  userId: string,
  handler: (payload: HostRealtimePayload) => void
): () => void {
  const ch = channel(userId);
  emitter.on(ch, handler);
  return () => {
    emitter.off(ch, handler);
  };
}
