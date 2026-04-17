/**
 * Bundle the Steamline host agent into a single CommonJS file for one-line installs.
 * Output: public/steamline-agent.cjs (served as a static asset by Next.js).
 */
import * as esbuild from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "public");
const outfile = join(outDir, "steamline-agent.cjs");
const previousOutfile = join(outDir, "steamline-agent-prev.cjs");
const releaseHistoryPath = join(outDir, "agent-release-history.json");

mkdirSync(outDir, { recursive: true });

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const agentSemver = typeof pkg.version === "string" ? pkg.version : "0.0.0";
let previousVersion = null;
if (existsSync(outfile)) {
  try {
    const prior = readFileSync(outfile, "utf8");
    const m = /__STEAMLINE_AGENT_SEMVER__:\s*"([^"]+)"/.exec(prior);
    if (m?.[1] && m[1] !== agentSemver) {
      previousVersion = m[1];
      copyFileSync(outfile, previousOutfile);
    }
  } catch {
    /* ignore */
  }
}

await esbuild.build({
  entryPoints: [join(root, "agent/cli.ts")],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile,
  /** Native/runtime addons are installed under ~/.steamline/node_modules by install-agent.sh */
  external: [
    "node-pty",
    "ssh2-sftp-client",
    "ssh2",
    "cpu-features",
    "rcon-client",
  ],
  /**
   * Shebang line 1; line 2 sets semver for `agent/agent-version.ts` (read via globalThis).
   */
  banner: {
    js:
      "#!/usr/bin/env node\n" +
      `Object.assign(globalThis,{__STEAMLINE_AGENT_SEMVER__:${JSON.stringify(agentSemver)}});\n`,
  },
  logLevel: "info",
});

writeFileSync(
  releaseHistoryPath,
  JSON.stringify(
    {
      currentVersion: agentSemver,
      previousVersion,
      previousArtifact:
        previousVersion && existsSync(previousOutfile)
          ? "steamline-agent-prev.cjs"
          : null,
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  ) + "\n",
  "utf8"
);
