import {
  forwardTerminalDataToBrowser,
  forwardTerminalErrorToBrowser,
} from "@/lib/terminal/relay-registry";

/**
 * Handle JSON the agent sent on its WebSocket (PTY output / errors).
 */
export function handleAgentTerminalUplink(msg: {
  type?: string;
  sessionId?: string;
  base64?: string;
  message?: string;
}): void {
  if (
    msg.type === "terminal_data" &&
    msg.sessionId &&
    typeof msg.base64 === "string"
  ) {
    forwardTerminalDataToBrowser(msg.sessionId, msg.base64);
    return;
  }
  if (
    msg.type === "terminal_error" &&
    msg.sessionId &&
    typeof msg.message === "string"
  ) {
    forwardTerminalErrorToBrowser(msg.sessionId, msg.message);
  }
}
