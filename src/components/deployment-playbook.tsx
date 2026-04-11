"use client";

import type { AllocatedPorts } from "@/lib/allocated-ports";
import type { HostMetricsSnapshot } from "@/lib/host-metrics";

type Props = {
  hostName: string | null;
  hostMetrics?: HostMetricsSnapshot | null;
  status: string;
  provisionMessage: string | null;
  allocatedPorts: AllocatedPorts | null | undefined;
};

function portList(ports: AllocatedPorts): string {
  const parts: string[] = [];
  if (ports.game != null) {
    parts.push(`game ${ports.game}`);
  }
  if (ports.query != null) {
    parts.push(`query / Steam ${ports.query}`);
  }
  if (ports.rcon != null) {
    parts.push(`RCON ${ports.rcon}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "";
}

/**
 * Connect hints after automation (ports, Windows firewall attempt, public IP from agent).
 */
export function DeploymentPlaybook({
  hostName,
  hostMetrics,
  status,
  provisionMessage,
  allocatedPorts,
}: Props) {
  if (!allocatedPorts || (allocatedPorts.game == null && allocatedPorts.query == null)) {
    return null;
  }

  const portsLine = portList(allocatedPorts);
  const started =
    provisionMessage?.toLowerCase().includes("dedicated command started") ??
    false;
  const pub = hostMetrics?.publicIpv4?.trim();
  const isWin =
    (hostMetrics?.platform ?? "").toLowerCase() === "win32" ||
    (hostMetrics?.platform ?? "").toLowerCase() === "windows";

  return (
    <div className="mt-3 rounded-md border border-primary/15 bg-primary/[0.04] p-3 text-xs leading-relaxed">
      <p className="font-semibold text-foreground">
        Your server ports (assigned automatically on this host)
      </p>
      <p className="mt-1 font-mono text-[11px] text-foreground/90">{portsLine}</p>

      {pub ? (
        <p className="mt-2 text-muted-foreground">
          <span className="font-medium text-foreground/90">Public IPv4</span>{" "}
          (from the host agent, best effort):{" "}
          <span className="font-mono text-foreground">{pub}</span>
          {" — "}
          friends usually connect with{" "}
          <span className="font-mono text-foreground">
            {pub}:{allocatedPorts.game ?? "?"}
          </span>{" "}
          or your game’s connect UI, unless the title uses a different scheme.
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Public IP will appear here after the next successful agent heartbeat
          (outbound HTTPS must be allowed from the host).
        </p>
      )}

      {isWin ? (
        <p className="mt-2 text-muted-foreground">
          <span className="font-medium text-foreground/90">Windows Firewall</span>
          {" — "}
          the agent tries to add inbound allow rules for UDP and TCP on these
          ports (see instance logs). If rules failed, run the agent once as{" "}
          <strong className="text-foreground/90">Administrator</strong> or add
          rules manually. Set{" "}
          <span className="font-mono text-foreground/80">STEAMLINE_SKIP_FIREWALL=1</span>{" "}
          to disable this behavior.
        </p>
      ) : null}

      <p className="mt-3 font-semibold text-foreground">Router (still manual)</p>
      <p className="mt-1 text-muted-foreground">
        Forward <strong>UDP</strong> (and <strong>TCP</strong> if your game’s
        docs require it) for the ports above to the LAN IP of{" "}
        {hostName ? (
          <span className="text-foreground">&quot;{hostName}&quot;</span>
        ) : (
          "this host"
        )}
        . Open your router admin (often{" "}
        <span className="font-mono text-foreground/80">192.168.1.1</span>) → Port
        forwarding / NAT / Virtual server.
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">
        If inbound connections never work even with forwarding, your ISP may use
        carrier-grade NAT — you would need a VPS or a business line with a real
        public IP.
      </p>

      <p className="mt-3 font-semibold text-foreground">Launch command</p>
      <p className="mt-1 text-muted-foreground">
        The agent runs{" "}
        <span className="font-mono text-foreground/80">
          STEAMLINE_AFTER_INSTALL_CMD
        </span>{" "}
        if set on the host; otherwise it uses the catalog entry’s{" "}
        <span className="font-mono text-foreground/80">afterInstallCmd</span>{" "}
        template field. Ports are passed as environment variables (
        <span className="font-mono text-foreground/80">STEAMLINE_GAME_PORT</span>,{" "}
        <span className="font-mono text-foreground/80">STEAMLINE_QUERY_PORT</span>
        , etc.); use{" "}
        <span className="font-mono text-foreground/80">%STEAMLINE_GAME_PORT%</span>{" "}
        in Windows cmd or{" "}
        <span className="font-mono text-foreground/80">
          {"$" + "{STEAMLINE_GAME_PORT}"}
        </span>{" "}
        in catalog strings (expanded by the agent).
      </p>

      {status === "running" && !started ? (
        <p className="mt-3 border-t border-border/50 pt-2 text-[11px] text-amber-700 dark:text-amber-500/90">
          Install finished but the agent did not report a started dedicated
          process. Set a host start command or extend the catalog template for
          this game so the real server binary runs with the ports above.
        </p>
      ) : null}
    </div>
  );
}
