/**
 * Best-effort public IPv4 for dashboard "connect here" hints (cached a few minutes).
 */

let cached: { ip: string; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function fetchPublicIpv4(): Promise<string | null> {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.ip;
  }
  const urls = [
    "https://api.ipify.org?format=json",
    "https://1.1.1.1/cdn-cgi/trace",
  ];
  for (const url of urls) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 6000);
      const res = await fetch(url, { signal: ac.signal });
      clearTimeout(t);
      if (!res.ok) {
        continue;
      }
      const text = await res.text();
      if (url.includes("ipify")) {
        const j = JSON.parse(text) as { ip?: string };
        if (j.ip && /^[\d.]+$/.test(j.ip)) {
          cached = { ip: j.ip, at: Date.now() };
          return j.ip;
        }
      } else {
        const m = /^ip=(.+)$/m.exec(text);
        if (m?.[1] && /^[\d.]+$/.test(m[1].trim())) {
          const ip = m[1].trim();
          cached = { ip, at: Date.now() };
          return ip;
        }
      }
    } catch {
      /* try next */
    }
  }
  return null;
}
