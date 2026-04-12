/**
 * True when the address is a syntactically valid IPv4 that is not reserved for
 * private LAN, loopback, or link-local use (avoids accidental internal probes).
 */
export function isProbeablePublicIpv4(ip: string): boolean {
  const s = ip.trim();
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) {
    return false;
  }
  const oct = [m[1], m[2], m[3], m[4]].map((x) => Number(x));
  if (oct.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = oct;
  if (a === 10) {
    return false;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return false;
  }
  if (a === 192 && b === 168) {
    return false;
  }
  if (a === 127 || a === 0) {
    return false;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return false;
  }
  if (a === 169 && b === 254) {
    return false;
  }
  if (a === 255 && b === 255) {
    return false;
  }
  return true;
}
