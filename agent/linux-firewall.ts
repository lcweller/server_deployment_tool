/**
 * Legacy compat facade. Firewall ownership moved to nftables reconciliation.
 * Per-instance lifecycle calls still invoke these functions, but the authoritative
 * state is enforced by `reconcileLinuxFirewall()` from the agent loop.
 */

export function applyLinuxFirewallForPorts(
  _installDir: string,
  ports: { game?: number; query?: number; rcon?: number }
): string[] {
  const hasAny = [ports.game, ports.query, ports.rcon].some(
    (p) => typeof p === "number" && p > 0 && p <= 65535
  );
  return hasAny
    ? ["[steamline] lifecycle firewall update queued (nftables reconcile loop owns final state)."]
    : [];
}

export function removeLinuxFirewallForPorts(_installDir: string): string[] {
  return [
    "[steamline] lifecycle firewall close queued (nftables reconcile loop owns final state).",
  ];
}
