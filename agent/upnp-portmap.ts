/**
 * UPnP IGD (Internet Gateway Device) — try to open WAN→LAN port mappings automatically.
 * Many home routers support this; failures are logged only. Disable with STEAMLINE_SKIP_UPNP=1.
 */
import * as dgram from "node:dgram";
import * as fs from "node:fs";
import * as path from "node:path";

import { guessLanIPv4 } from "./lan-ip";

const MAP_FILE = ".steamline-upnp-mappings.json";

export type UpnpMappingRecord = {
  controlUrl: string;
  serviceUrn: string;
  remoteHost: string;
  externalPort: number;
  protocol: "UDP" | "TCP";
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function soapEnvelope(serviceUrn: string, action: string, inner: string): string {
  return (
    `<?xml version="1.0"?>` +
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<s:Body>` +
    `<u:${action} xmlns:u="${serviceUrn}">` +
    inner +
    `</u:${action}>` +
    `</s:Body></s:Envelope>`
  );
}

async function soapPost(
  controlUrl: string,
  serviceUrn: string,
  action: "AddPortMapping" | "DeletePortMapping",
  inner: string
): Promise<{ ok: boolean; status: number; text: string }> {
  const body = soapEnvelope(serviceUrn, action, inner);
  const soapAction = `"${serviceUrn}#${action}"`;
  try {
    const res = await fetch(controlUrl, {
      method: "POST",
      headers: {
        "Content-Type": 'text/xml; charset="utf-8"',
        SOAPAction: soapAction,
      },
      body,
    });
    const text = await res.text();
    const ok =
      res.ok &&
      !/<(SOAP-ENV:|s:)?Fault[\s>]/i.test(text) &&
      !/<errorCode>\s*[1-9]\d*\s*<\/errorCode>/i.test(text);
    return { ok, status: res.status, text: text.slice(0, 500) };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      text: e instanceof Error ? e.message : String(e),
    };
  }
}

function discoverSsdpLocations(timeoutMs: number): Promise<string[]> {
  return new Promise((resolve) => {
    const found = new Set<string>();
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const msg = Buffer.from(
      "M-SEARCH * HTTP/1.1\r\n" +
        "HOST: 239.255.255.250:1900\r\n" +
        'MAN: "ssdp:discover"\r\n' +
        "ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n" +
        "MX: 2\r\n\r\n"
    );

    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve([...found]);
    };

    const timer = setTimeout(finish, timeoutMs);

    socket.on("error", () => {
      clearTimeout(timer);
      finish();
    });
    socket.on("message", (buf) => {
      const text = buf.toString("utf8");
      const m = /^LOCATION:\s*(\S+)/im.exec(text);
      if (m?.[1]) {
        try {
          found.add(new URL(m[1].trim()).href);
        } catch {
          found.add(m[1].trim());
        }
      }
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
      } catch {
        /* ignore */
      }
      socket.send(msg, 0, msg.length, 1900, "239.255.255.250", (err) => {
        if (err) {
          clearTimeout(timer);
          finish();
        }
      });
    });
  });
}

function findWanService(
  rootXml: string,
  locationHref: string
): { controlUrl: string; serviceUrn: string } | null {
  const re = /<service>([\s\S]*?)<\/service>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rootXml))) {
    const block = m[1] ?? "";
    const st = /<serviceType>\s*([^<]+?)\s*<\/serviceType>/i.exec(block);
    const cu = /<controlURL>\s*([^<]+?)\s*<\/controlURL>/i.exec(block);
    if (!st?.[1] || !cu?.[1]) {
      continue;
    }
    const type = st[1].trim();
    if (!/WANIPConnection|WANPPPConnection/i.test(type)) {
      continue;
    }
    const rel = cu[1].trim();
    try {
      const abs = new URL(rel, locationHref).href;
      return { controlUrl: abs, serviceUrn: type };
    } catch {
      continue;
    }
  }
  return null;
}

async function tryGatewayMappings(
  locationRoot: string,
  instanceId: string,
  internalClient: string,
  ports: { game?: number; query?: number; rcon?: number },
  leaseSec: number
): Promise<{ logs: string[]; records: UpnpMappingRecord[] }> {
  const logs: string[] = [];
  const records: UpnpMappingRecord[] = [];
  let rootXml: string;
  try {
    const res = await fetch(locationRoot, { signal: AbortSignal.timeout(5000) });
    rootXml = await res.text();
  } catch (e) {
    logs.push(
      `[steamline] UPnP: could not fetch ${locationRoot}: ${e instanceof Error ? e.message : String(e)}`
    );
    return { logs, records };
  }

  const wan = findWanService(rootXml, locationRoot);
  if (!wan) {
    logs.push("[steamline] UPnP: no WANIPConnection/WANPPPConnection service in IGD descriptor.");
    return { logs, records };
  }

  const uniq = new Set<number>();
  for (const p of [ports.game, ports.query, ports.rcon]) {
    if (typeof p === "number" && p > 0 && p <= 65535) {
      uniq.add(p);
    }
  }
  if (uniq.size === 0) {
    return { logs, records };
  }

  const shortId = instanceId.replace(/-/g, "").slice(0, 10);

  for (const port of uniq) {
    for (const proto of ["UDP", "TCP"] as const) {
      const desc = escapeXml(`Steamline-${shortId}-${proto}-${port}`);
      const inner =
        `<NewRemoteHost></NewRemoteHost>` +
        `<NewExternalPort>${port}</NewExternalPort>` +
        `<NewProtocol>${proto}</NewProtocol>` +
        `<NewInternalPort>${port}</NewInternalPort>` +
        `<NewInternalClient>${escapeXml(internalClient)}</NewInternalClient>` +
        `<NewEnabled>1</NewEnabled>` +
        `<NewPortMappingDescription>${desc}</NewPortMappingDescription>` +
        `<NewLeaseDuration>${leaseSec}</NewLeaseDuration>`;

      const r = await soapPost(
        wan.controlUrl,
        wan.serviceUrn,
        "AddPortMapping",
        inner
      );
      if (r.ok) {
        logs.push(`UPnP: mapped WAN ${proto} ${port} → ${internalClient}:${port}`);
        records.push({
          controlUrl: wan.controlUrl,
          serviceUrn: wan.serviceUrn,
          remoteHost: "",
          externalPort: port,
          protocol: proto,
        });
      } else {
        logs.push(
          `[steamline] UPnP AddPortMapping ${proto} ${port} failed (HTTP ${r.status}): ${r.text}`
        );
      }
    }
  }

  return { logs, records };
}

/**
 * Attempt UPnP port forwards for all distinct game/query/RCON ports.
 */
export async function tryUpnpPortForward(
  instanceId: string,
  installDir: string,
  ports: { game?: number; query?: number; rcon?: number }
): Promise<string[]> {
  const logs: string[] = [];
  if (process.env.STEAMLINE_SKIP_UPNP === "1") {
    logs.push("[steamline] STEAMLINE_SKIP_UPNP=1 — skipping UPnP port mapping.");
    return logs;
  }

  const internalClient = guessLanIPv4();
  if (!internalClient) {
    logs.push("[steamline] UPnP skipped — no LAN IPv4 detected on this host.");
    return logs;
  }

  const hasPorts = [ports.game, ports.query, ports.rcon].some(
    (p) => typeof p === "number" && p > 0
  );
  if (!hasPorts) {
    logs.push("[steamline] UPnP skipped — no ports to map.");
    return logs;
  }

  const locations = await discoverSsdpLocations(2800);
  if (locations.length === 0) {
    logs.push(
      "[steamline] UPnP: no IGD responded to SSDP (router may not support UPnP or multicast is blocked)."
    );
    return logs;
  }

  const leaseSec = Math.min(
    86_400,
    Math.max(600, Number(process.env.STEAMLINE_UPNP_LEASE_SEC) || 7200)
  );

  const allRecords: UpnpMappingRecord[] = [];
  for (const loc of locations.slice(0, 6)) {
    const { logs: lg, records } = await tryGatewayMappings(
      loc,
      instanceId,
      internalClient,
      ports,
      leaseSec
    );
    logs.push(...lg);
    if (records.length > 0) {
      allRecords.push(...records);
      break;
    }
  }

  if (allRecords.length > 0) {
    try {
      fs.writeFileSync(
        path.join(installDir, MAP_FILE),
        JSON.stringify(allRecords, null, 0),
        "utf8"
      );
    } catch (e) {
      logs.push(
        `[steamline] UPnP: could not save mapping file: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return logs;
}

export async function removeUpnpPortMappings(installDir: string): Promise<string[]> {
  const logs: string[] = [];
  const fp = path.join(installDir, MAP_FILE);
  if (!fs.existsSync(fp)) {
    return logs;
  }
  let list: UpnpMappingRecord[];
  try {
    list = JSON.parse(fs.readFileSync(fp, "utf8")) as UpnpMappingRecord[];
    if (!Array.isArray(list)) {
      return logs;
    }
  } catch {
    return logs;
  }

  for (const rec of list) {
    const inner =
      `<NewRemoteHost>${escapeXml(rec.remoteHost)}</NewRemoteHost>` +
      `<NewExternalPort>${rec.externalPort}</NewExternalPort>` +
      `<NewProtocol>${rec.protocol}</NewProtocol>`;
    const r = await soapPost(
      rec.controlUrl,
      rec.serviceUrn,
      "DeletePortMapping",
      inner
    );
    logs.push(
      r.ok
        ? `UPnP: removed ${rec.protocol} ${rec.externalPort}`
        : `UPnP DeletePortMapping ${rec.protocol} ${rec.externalPort} HTTP ${r.status}`
    );
  }

  try {
    fs.unlinkSync(fp);
  } catch {
    /* ignore */
  }
  return logs;
}
