/**
 * Best-effort check that a PID still refers to a live OS process on this host.
 */
export function isProcessLikelyAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
