"use client";

import { ConnectivityCheckButton } from "@/components/connectivity-check-button";
import type { AllocatedPorts } from "@/lib/allocated-ports";
import type { HostMetricsSnapshot } from "@/lib/host-metrics";

type Props = {
  instanceId: string;
  hostName: string | null;
  hostMetrics?: HostMetricsSnapshot | null;
  status: string;
  provisionMessage: string | null;
  allocatedPorts: AllocatedPorts | null | undefined;
  /** From instance API; when false, connectivity check is disabled client-side. */
  hostReachable?: boolean;
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
  instanceId,
  hostName,
  hostMetrics,
  status,
  provisionMessage,
  allocatedPorts,
  hostReachable = true,
}: Props) {
  if (status === "stopped" || status === "stopping" || status === "starting") {
    return null;
  }
  if (!allocatedPorts || (allocatedPorts.game == null && allocatedPorts.query == null)) {
    return null;
  }

  const portsLine = portList(allocatedPorts);
  const started =
    provisionMessage?.toLowerCase().includes("dedicated command started") ??
    false;
  const pub = hostMetrics?.publicIpv4?.trim();
  const plat = (hostMetrics?.platform ?? "").toLowerCase();
  const isWin = plat === "win32" || plat === "windows";
  const isLinux = plat === "linux";

  return (
    <div className="mt-3 rounded-md border border-primary/15 bg-primary/[0.04] p-3 text-xs leading-relaxed">
      <p className="font-semibold text-foreground">What Steamline automates</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
        <li>Non-conflicting game/query ports per host, plus on-host bind checks</li>
        <li>SteamCMD cache reuse and game file install via SteamCMD</li>
        <li>
          Start command: host override → catalog →{" "}
          <strong className="text-foreground/90">built-in Steam App preset</strong>{" "}
          (known titles) →{" "}
          <strong className="text-foreground/90">auto-detected</strong> binary;
          catalog{" "}
          <span className="font-mono text-foreground/80">defaultLaunchArgs</span>{" "}
          merges with presets for extra flags
        </li>
        <li>Windows inbound firewall rules (UDP/TCP) when permitted</li>
        {isLinux ? (
          <li>
            Linux <span className="font-mono text-foreground/80">firewall-cmd</span>{" "}
            port opens when firewalld is available
          </li>
        ) : null}
        <li>
          Router <strong className="text-foreground/90">UPnP</strong> port maps
          (when the router exposes an IGD and UPnP is on — see logs)
        </li>
        <li>Public IPv4 on each heartbeat (for connect hints)</li>
      </ul>

      <p className="mt-3 font-semibold text-foreground">
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

      <p className="mt-3 font-semibold text-foreground">Router &amp; internet</p>
      <p className="mt-1 text-muted-foreground">
        The agent already tries <strong>UPnP</strong> on many home routers so you
        may not need manual forwarding. If friends still cannot connect, add
        explicit <strong>UDP</strong> (and <strong>TCP</strong> if the game
        requires it) port forwarding to the LAN IP of{" "}
        {hostName ? (
          <span className="text-foreground">&quot;{hostName}&quot;</span>
        ) : (
          "this host"
        )}{" "}
        in your router admin.
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Carrier-grade NAT or disabled UPnP can still block inbound traffic — then
        use a VPS or a line with a real public IP.
      </p>

      {(status === "running" || status === "recovering") && pub ? (
        <ConnectivityCheckButton
          instanceId={instanceId}
          hostReachable={hostReachable}
        />
      ) : null}

      <p className="mt-3 font-semibold text-foreground">Fine-tuning (optional)</p>
      <p className="mt-1 text-muted-foreground">
        Override start with{" "}
        <span className="font-mono text-foreground/80">
          STEAMLINE_AFTER_INSTALL_CMD
        </span>
        , or set catalog{" "}
        <span className="font-mono text-foreground/80">afterInstallCmd</span> /{" "}
        <span className="font-mono text-foreground/80">defaultLaunchArgs</span>{" "}
        for exact game flags. Env vars{" "}
        <span className="font-mono text-foreground/80">STEAMLINE_GAME_PORT</span> /{" "}
        <span className="font-mono text-foreground/80">STEAMLINE_QUERY_PORT</span>{" "}
        are always set; use{" "}
        <span className="font-mono text-foreground/80">%STEAMLINE_GAME_PORT%</span>{" "}
        in cmd or{" "}
        <span className="font-mono text-foreground/80">
          {"$" + "{STEAMLINE_GAME_PORT}"}
        </span>{" "}
        in catalog strings. Disable slices of automation:{" "}
        <span className="font-mono text-foreground/80">STEAMLINE_SKIP_UPNP</span>,{" "}
        <span className="font-mono text-foreground/80">STEAMLINE_SKIP_FIREWALL</span>
        ,{" "}
        <span className="font-mono text-foreground/80">
          STEAMLINE_SKIP_LINUX_FIREWALL
        </span>
        ,{" "}
        <span className="font-mono text-foreground/80">
          STEAMLINE_DISABLE_AUTO_LAUNCH
        </span>
        .
      </p>

      {status === "running" && !started ? (
        <p className="mt-3 border-t border-border/50 pt-2 text-[11px] text-amber-700 dark:text-amber-500/90">
          Install finished but no process stayed running (wrong binary pick,
          missing game flags, or immediate exit). Check instance logs — set
          catalog <span className="font-mono">defaultLaunchArgs</span> or a full{" "}
          <span className="font-mono">afterInstallCmd</span> for that title.
        </p>
      ) : null}
    </div>
  );
}
