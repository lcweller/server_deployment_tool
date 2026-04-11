"use client";

import type { AllocatedPorts } from "@/lib/allocated-ports";

type Props = {
  /** When set, we mention this machine in copy */
  hostName: string | null;
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
 * Steps the platform cannot do for you (router, OS firewall, public IP) — written for non-experts.
 */
export function DeploymentPlaybook({
  hostName,
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

  return (
    <div className="mt-3 rounded-md border border-primary/15 bg-primary/[0.04] p-3 text-xs leading-relaxed">
      <p className="font-semibold text-foreground">
        Your server ports (auto-assigned on this host)
      </p>
      <p className="mt-1 font-mono text-[11px] text-foreground/90">{portsLine}</p>
      <p className="mt-3 font-semibold text-foreground">
        What you still need to do (we can’t click your router for you)
      </p>
      <ol className="mt-2 list-decimal space-y-2 pl-4 text-muted-foreground">
        <li>
          <span className="text-foreground/90">Port forwarding</span> — On your
          home router, forward <strong>UDP</strong> (and <strong>TCP</strong> if
          your game’s docs say so) for the ports above to the computer running{" "}
          {hostName ? (
            <span className="text-foreground">&quot;{hostName}&quot;</span>
          ) : (
            "this host"
          )}
          . Look for &quot;Port forwarding&quot; or &quot;NAT&quot; in the router
          admin page (often{" "}
          <span className="font-mono text-foreground/80">192.168.1.1</span> or{" "}
          <span className="font-mono text-foreground/80">192.168.0.1</span>
          ).
        </li>
        <li>
          <span className="text-foreground/90">Windows Firewall</span> — If the
          host is Windows, allow inbound rules for the same ports (UDP/TCP as
          needed), or allow your game’s executable when Windows prompts.
        </li>
        <li>
          <span className="text-foreground/90">Public address</span> — Friends
          usually connect using your{" "}
          <strong className="text-foreground/90">public IP</strong> (search
          &quot;what is my IP&quot; in a browser on the host) and the{" "}
          <strong className="text-foreground/90">game port</strong> above. If the
          IP changes (typical home internet), friends may need the new IP unless
          you use a DNS name.
        </li>
        <li>
          <span className="text-foreground/90">Game-specific flags</span> — Many
          titles need launch args or config files to bind to{" "}
          <span className="font-mono text-foreground/80">STEAMLINE_GAME_PORT</span>{" "}
          / <span className="font-mono text-foreground/80">STEAMLINE_QUERY_PORT</span>{" "}
          from the environment when you use{" "}
          <span className="font-mono text-foreground/80">
            STEAMLINE_AFTER_INSTALL_CMD
          </span>{" "}
          on the agent. Check that game’s dedicated-server documentation.
        </li>
      </ol>
      {status === "running" && !started ? (
        <p className="mt-3 border-t border-border/50 pt-2 text-[11px] text-amber-700 dark:text-amber-500/90">
          Files are installed, but no start command reported success yet. If
          friends can’t connect, configure{" "}
          <span className="font-mono">STEAMLINE_AFTER_INSTALL_CMD</span> on the
          host so the dedicated binary actually runs with these ports.
        </p>
      ) : null}
    </div>
  );
}
