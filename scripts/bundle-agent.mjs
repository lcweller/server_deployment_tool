/**
 * Bundle the Steamline host agent into a single CommonJS file for one-line installs.
 * Output: public/steamline-agent.cjs (served as a static asset by Next.js).
 */
import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "public");
const outfile = join(outDir, "steamline-agent.cjs");

mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [join(root, "agent/cli.ts")],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile,
  /** Single shebang on line 1 — entry file must not contain another #! or Node parses the second as JS. */
  banner: {
    js: "#!/usr/bin/env node\n",
  },
  logLevel: "info",
});
