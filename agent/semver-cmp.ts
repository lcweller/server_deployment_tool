/** Minimal semver comparison (major.minor.patch numeric parts; ignores prerelease suffix for ordering). */
export function compareSemver(a: string, b: string): number {
  const core = (s: string) => s.split(/[-+]/)[0] ?? s;
  const pa = core(a)
    .split(".")
    .map((x) => parseInt(x.replace(/\D/g, ""), 10) || 0);
  const pb = core(b)
    .split(".")
    .map((x) => parseInt(x.replace(/\D/g, ""), 10) || 0);
  const n = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) {
      return -1;
    }
    if (da > db) {
      return 1;
    }
  }
  return 0;
}
