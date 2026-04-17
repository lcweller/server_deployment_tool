import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import pkg from "../../package.json";
import { publicAppUrl } from "@/lib/public-app-url";

export type AgentReleaseManifest = {
  version: string;
  downloadUrl: string;
  checksumSha256: string;
  releaseNotes: string;
  minAgentVersion: string | null;
  previousVersion?: string | null;
};

function artifactPath(): string {
  return join(process.cwd(), "public", "steamline-agent.cjs");
}
function previousArtifactPath(): string {
  return join(process.cwd(), "public", "steamline-agent-prev.cjs");
}
function releaseHistoryPath(): string {
  return join(process.cwd(), "public", "agent-release-history.json");
}

/** Semver of the agent artifact shipped with this dashboard build. */
export function getPublishedAgentSemver(): string {
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}

export function loadBundledAgentBytes(): Buffer | null {
  const p = artifactPath();
  if (!existsSync(p)) {
    return null;
  }
  return readFileSync(p);
}

type ReleaseHistory = {
  currentVersion: string;
  previousVersion: string | null;
  previousArtifact: string | null;
};

function readReleaseHistory(): ReleaseHistory | null {
  const p = releaseHistoryPath();
  if (!existsSync(p)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<ReleaseHistory>;
    return {
      currentVersion:
        typeof raw.currentVersion === "string"
          ? raw.currentVersion
          : getPublishedAgentSemver(),
      previousVersion:
        typeof raw.previousVersion === "string" ? raw.previousVersion : null,
      previousArtifact:
        typeof raw.previousArtifact === "string" ? raw.previousArtifact : null,
    };
  } catch {
    return null;
  }
}

export function loadAgentArtifactByVersion(version: string): Buffer | null {
  const current = getPublishedAgentSemver();
  if (version === current) {
    return loadBundledAgentBytes();
  }
  const h = readReleaseHistory();
  if (
    h?.previousVersion === version &&
    h.previousArtifact === "steamline-agent-prev.cjs" &&
    existsSync(previousArtifactPath())
  ) {
    return readFileSync(previousArtifactPath());
  }
  return null;
}

export function checksumSha256OfBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Public base URL for links returned to agents (prefer configured APP_PUBLIC_URL).
 */
export function agentArtifactBaseUrl(request: Request): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, "");
  }
  return publicAppUrl();
}

export function buildAgentReleaseManifest(request: Request): AgentReleaseManifest | null {
  const buf = loadBundledAgentBytes();
  if (!buf) {
    return null;
  }
  const version = getPublishedAgentSemver();
  const checksumSha256 = checksumSha256OfBuffer(buf);
  const base = agentArtifactBaseUrl(request);
  const downloadUrl = `${base}/api/v1/agent/artifact?version=${encodeURIComponent(version)}`;
  const releaseNotes =
    process.env.AGENT_RELEASE_NOTES?.trim() ||
    `Steamline host agent ${version} (bundled with this control plane).`;
  const minRaw = process.env.AGENT_MIN_AGENT_VERSION?.trim();
  return {
    version,
    downloadUrl,
    checksumSha256,
    releaseNotes,
    minAgentVersion: minRaw && minRaw.length > 0 ? minRaw : null,
    previousVersion: readReleaseHistory()?.previousVersion ?? null,
  };
}
