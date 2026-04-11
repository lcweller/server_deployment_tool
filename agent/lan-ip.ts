/**
 * Guess this host's LAN IPv4 for UPnP internal client / firewall hints.
 */
import * as os from "node:os";

const PRIVATE_RE =
  /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)\d{1,3}\.\d{1,3}$/;

export function guessLanIPv4(): string | null {
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] ?? []) {
      if (a.family !== "IPv4" || a.internal) {
        continue;
      }
      if (PRIVATE_RE.test(a.address)) {
        return a.address;
      }
    }
  }
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] ?? []) {
      if (a.family === "IPv4" && !a.internal) {
        return a.address;
      }
    }
  }
  return null;
}
