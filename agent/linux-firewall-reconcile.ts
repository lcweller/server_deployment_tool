import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

type RunningPortSet = { game?: number; query?: number; rcon?: number };
type RunningInstance = { id: string; ports?: RunningPortSet | null };

const STATE_FILE = "steamline-firewall-reconcile.json";
const TABLE = "steamline";

function hasNft(): boolean {
  const r = spawnSync("sh", ["-c", "command -v nft"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return r.status === 0 && (r.stdout ?? "").trim().length > 0;
}

function hasFirewallCmd(): boolean {
  const r = spawnSync("sh", ["-c", "command -v firewall-cmd"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return r.status === 0 && (r.stdout ?? "").trim().length > 0;
}

function isRoot(): boolean {
  try {
    return typeof process.getuid === "function" && process.getuid() === 0;
  } catch {
    return false;
  }
}

function normalizePorts(instances: RunningInstance[]): number[] {
  const out = new Set<number>();
  for (const inst of instances) {
    for (const p of [inst.ports?.game, inst.ports?.query, inst.ports?.rcon]) {
      if (typeof p === "number" && p > 0 && p <= 65535) {
        out.add(p);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

function agentInboundPorts(): number[] {
  const raw = process.env.STEAMLINE_AGENT_ALLOW_TCP_PORTS?.trim();
  if (!raw) {
    return [];
  }
  const out = new Set<number>();
  for (const s of raw.split(",")) {
    const n = Number(s.trim());
    if (Number.isFinite(n) && n > 0 && n <= 65535) {
      out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

function renderNftScript(gamePorts: number[]): string {
  const agentPorts = agentInboundPorts();
  const gameSet = gamePorts.length > 0 ? gamePorts.join(", ") : "";
  const agentSet = agentPorts.length > 0 ? agentPorts.join(", ") : "";
  const allowAgent =
    agentSet.length > 0
      ? `add rule inet ${TABLE} input tcp dport { ${agentSet} } ct state new accept`
      : "";
  const allowGame =
    gameSet.length > 0
      ? [
          `add rule inet ${TABLE} input tcp dport { ${gameSet} } ct state new limit rate 80/second burst 150 packets accept`,
          `add rule inet ${TABLE} input udp dport { ${gameSet} } limit rate 250/second burst 500 packets accept`,
        ].join("\n")
      : "";

  return [
    `flush table inet ${TABLE}`,
    `add table inet ${TABLE}`,
    `add chain inet ${TABLE} input { type filter hook input priority 0; policy drop; }`,
    `add chain inet ${TABLE} forward { type filter hook forward priority 0; policy drop; }`,
    `add chain inet ${TABLE} output { type filter hook output priority 0; policy accept; }`,
    `add rule inet ${TABLE} input iif lo accept`,
    `add rule inet ${TABLE} input ct state established,related accept`,
    allowAgent,
    allowGame,
  ]
    .filter(Boolean)
    .join("\n");
}

function statePath(): string {
  const root = process.env.STEAMLINE_DATA_ROOT ?? path.join(process.cwd(), "steamline-data");
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch {
    /* ignore */
  }
  return path.join(root, STATE_FILE);
}

function readPreviousHash(): string {
  const fp = statePath();
  if (!fs.existsSync(fp)) {
    return "";
  }
  try {
    const j = JSON.parse(fs.readFileSync(fp, "utf8")) as { desiredHash?: string };
    return typeof j.desiredHash === "string" ? j.desiredHash : "";
  } catch {
    return "";
  }
}

function writeState(desiredHash: string): void {
  const fp = statePath();
  fs.writeFileSync(fp, JSON.stringify({ desiredHash, at: new Date().toISOString() }), "utf8");
}

function currentNftSnapshot(): string {
  try {
    return execFileSync("nft", ["list", "table", "inet", TABLE], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function snapshotMatchesIntent(snapshot: string, gamePorts: number[]): boolean {
  if (!snapshot || !snapshot.includes(`table inet ${TABLE}`)) {
    return false;
  }
  if (!snapshot.includes("policy drop")) {
    return false;
  }
  const agentPorts = agentInboundPorts();
  for (const p of agentPorts) {
    if (!snapshot.includes(`dport ${p}`) && !snapshot.includes(`dport {`)) {
      return false;
    }
  }
  for (const p of gamePorts) {
    if (!snapshot.includes(`dport ${p}`) && !snapshot.includes(`dport {`)) {
      return false;
    }
  }
  return true;
}

const FW_STATE_FIREWALLD = "steamline-firewalld-ports.json";

function firewalldStatePath(): string {
  const root = process.env.STEAMLINE_DATA_ROOT ?? path.join(process.cwd(), "steamline-data");
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch {
    /* ignore */
  }
  return path.join(root, FW_STATE_FIREWALLD);
}

function reconcileFirewalld(instances: RunningInstance[], logs: string[]): void {
  const gamePorts = normalizePorts(instances);
  const agentTcp = agentInboundPorts();
  const tcpWant = new Set<number>([...agentTcp, ...gamePorts]);
  const udpWant = new Set<number>(gamePorts);

  let prevTcp = new Set<number>();
  let prevUdp = new Set<number>();
  try {
    const fp = firewalldStatePath();
    if (fs.existsSync(fp)) {
      const j = JSON.parse(fs.readFileSync(fp, "utf8")) as {
        tcp?: number[];
        udp?: number[];
      };
      prevTcp = new Set((j.tcp ?? []).filter((n) => n > 0 && n <= 65535));
      prevUdp = new Set((j.udp ?? []).filter((n) => n > 0 && n <= 65535));
    }
  } catch {
    /* ignore */
  }

  const remove = (proto: "tcp" | "udp", p: number) => {
    try {
      execFileSync("firewall-cmd", ["--permanent", `--remove-port=${p}/${proto}`], {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      /* port may already be absent */
    }
  };
  const add = (proto: "tcp" | "udp", p: number) => {
    try {
      execFileSync("firewall-cmd", ["--permanent", `--add-port=${p}/${proto}`], {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      /* may already exist */
    }
  };

  try {
    for (const p of prevTcp) {
      if (!tcpWant.has(p)) {
        remove("tcp", p);
      }
    }
    for (const p of prevUdp) {
      if (!udpWant.has(p)) {
        remove("udp", p);
      }
    }
    for (const p of tcpWant) {
      if (!prevTcp.has(p)) {
        add("tcp", p);
      }
    }
    for (const p of udpWant) {
      if (!prevUdp.has(p)) {
        add("udp", p);
      }
    }
    try {
      execFileSync("firewall-cmd", ["--reload"], { stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      /* reload best-effort */
    }
    fs.writeFileSync(
      firewalldStatePath(),
      JSON.stringify({
        tcp: [...tcpWant].sort((a, b) => a - b),
        udp: [...udpWant].sort((a, b) => a - b),
        at: new Date().toISOString(),
      }),
      "utf8"
    );
    logs.push(
      `[steamline] firewalld reconcile applied (fallback: no nft); tcp=${tcpWant.size} udp=${udpWant.size} game instance port(s).`
    );
  } catch (e) {
    logs.push(
      `[steamline] firewalld reconcile failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export function reconcileLinuxFirewall(instances: RunningInstance[]): string[] {
  const logs: string[] = [];
  if (process.platform !== "linux") {
    return logs;
  }
  if (!isRoot()) {
    logs.push("[steamline] firewall reconcile skipped: agent is not running as root.");
    return logs;
  }

  const ports = normalizePorts(instances);

  if (hasNft()) {
    const desired = renderNftScript(ports);
    const desiredHash = `${desired.length}:${desired}`;
    const previousHash = readPreviousHash();
    const snapshot = currentNftSnapshot();
    const snapshotOk = snapshotMatchesIntent(snapshot, ports);
    const driftDetected =
      !snapshotOk || snapshot.length === 0 || (previousHash !== "" && previousHash !== desiredHash);
    if (!driftDetected && previousHash === desiredHash && snapshotOk) {
      return logs;
    }
    try {
      execFileSync("nft", ["-f", "-"], {
        input: `${desired}\n`,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      writeState(desiredHash);
      logs.push(
        `[steamline] nftables reconcile applied (${ports.length} game port(s)); drift=${driftDetected ? "yes" : "no"}.`
      );
    } catch (e) {
      logs.push(
        `[steamline] nftables reconcile failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    return logs;
  }

  if (hasFirewallCmd()) {
    reconcileFirewalld(instances, logs);
    return logs;
  }

  logs.push(
    "[steamline] firewall reconcile skipped: neither `nft` nor `firewall-cmd` found — install nftables (preferred) or firewalld."
  );
  return logs;
}

