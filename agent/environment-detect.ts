/**
 * Best-effort hosting environment: bare-metal vs VM vs VPS vs container.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";

export type HostingEnvironment = {
  hostingType: "bare-metal" | "vm" | "vps" | "container" | "unknown";
  /** e.g. kvm, vmware, microsoft — from systemd-detect-virt or DMI */
  hypervisor: string | null;
  /** Cloud / hoster name when inferrable */
  provider: string | null;
  /** Raw virt tool output or short note */
  virtualizationDetail: string | null;
  /** DMI system manufacturer when readable */
  systemManufacturer: string | null;
  /** DMI product name when readable */
  systemProductName: string | null;
};

function readTrim(path: string): string | null {
  try {
    return fs.readFileSync(path, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function isContainerCgroup(): boolean {
  if (process.platform !== "linux") {
    return false;
  }
  try {
    const cg = fs.readFileSync("/proc/self/cgroup", "utf8");
    if (/docker|kubepods|containerd|lxc|podman/i.test(cg)) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (fs.existsSync("/.dockerenv")) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function systemdDetectVirt(): string | null {
  if (process.platform !== "linux") {
    return null;
  }
  const attempts = [
    ["systemd-detect-virt"],
    ["/usr/bin/systemd-detect-virt"],
  ];
  for (const argv of attempts) {
    try {
      const out = execFileSync(argv[0]!, [], {
        encoding: "utf8",
        timeout: 3000,
        maxBuffer: 64 * 1024,
      }).trim();
      return out || null;
    } catch {
      /* try next */
    }
  }
  return null;
}

function inferProviderFromDmi(
  vendor: string | null,
  product: string | null
): string | null {
  const v = `${vendor ?? ""} ${product ?? ""}`.toLowerCase();
  if (v.includes("amazon") && v.includes("ec2")) {
    return "AWS";
  }
  if (v.includes("google")) {
    return "GCP";
  }
  if (v.includes("microsoft") && v.includes("virtual machine")) {
    return "Azure";
  }
  if (v.includes("digitalocean") || v.includes("droplet")) {
    return "DigitalOcean";
  }
  if (v.includes("hetzner")) {
    return "Hetzner";
  }
  if (v.includes("vultr")) {
    return "Vultr";
  }
  if (v.includes("linode") || v.includes("akamai")) {
    return "Linode";
  }
  if (v.includes("ovh")) {
    return "OVH";
  }
  if (v.includes("scaleway")) {
    return "Scaleway";
  }
  if (v.includes("upcloud")) {
    return "UpCloud";
  }
  if (v.includes("hivelocity")) {
    return "Hivelocity";
  }
  return null;
}

/**
 * Detect environment (Linux-focused; macOS/Windows return unknown + best-effort).
 */
export function detectHostingEnvironment(): HostingEnvironment {
  const empty = (): HostingEnvironment => ({
    hostingType: "unknown",
    hypervisor: null,
    provider: null,
    virtualizationDetail: null,
    systemManufacturer: null,
    systemProductName: null,
  });

  if (process.platform !== "linux") {
    return empty();
  }

  if (isContainerCgroup()) {
    return {
      hostingType: "container",
      hypervisor: null,
      provider: null,
      virtualizationDetail: "cgroup / .dockerenv",
      systemManufacturer: readTrim("/sys/class/dmi/id/sys_vendor"),
      systemProductName: readTrim("/sys/class/dmi/id/product_name"),
    };
  }

  const virt = systemdDetectVirt();
  const sysVendor = readTrim("/sys/class/dmi/id/sys_vendor");
  const productName = readTrim("/sys/class/dmi/id/product_name");
  const provider = inferProviderFromDmi(sysVendor, productName);

  const virtNorm = virt?.toLowerCase() ?? "";
  const isNone = !virt || virtNorm === "none";

  if (
    virtNorm === "docker" ||
    virtNorm === "lxc" ||
    virtNorm === "podman" ||
    virtNorm === "openvz" ||
    virtNorm === "container-other"
  ) {
    return {
      hostingType: "container",
      hypervisor: virt,
      provider: null,
      virtualizationDetail: virt,
      systemManufacturer: sysVendor,
      systemProductName: productName,
    };
  }

  if (provider) {
    return {
      hostingType: "vps",
      hypervisor: isNone ? "kvm" : virt,
      provider,
      virtualizationDetail: virt,
      systemManufacturer: sysVendor,
      systemProductName: productName,
    };
  }

  if (!isNone) {
    return {
      hostingType: "vm",
      hypervisor: virt,
      provider: null,
      virtualizationDetail: virt,
      systemManufacturer: sysVendor,
      systemProductName: productName,
    };
  }

  return {
    hostingType: "bare-metal",
    hypervisor: null,
    provider: null,
    virtualizationDetail: virt,
    systemManufacturer: sysVendor,
    systemProductName: productName,
  };
}
