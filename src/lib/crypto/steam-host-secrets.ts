import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
const SALT = "steamline-pending-steam-v1";

export type SteamHostSecretsPayload = {
  steamUsername: string;
  steamPassword: string;
  steamGuardCode?: string;
};

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SALT, 32);
}

function getMasterSecret(): string {
  const s =
    process.env.STEAMLINE_HOST_STEAM_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (!s || s.length < 16) {
    throw new Error(
      "Set STEAMLINE_HOST_STEAM_SECRET (recommended) or AUTH_SECRET (min 16 chars) to encrypt queued Steam host credentials."
    );
  }
  return s;
}

/** Encrypted blob stored in `hosts.steam_secrets_pending` until the agent picks it up. */
export function encryptSteamHostSecretsPending(
  payload: SteamHostSecretsPayload
): string {
  const key = deriveKey(getMasterSecret());
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString("base64");
}

export function decryptSteamHostSecretsPending(
  blob: string
): SteamHostSecretsPayload {
  const key = deriveKey(getMasterSecret());
  const raw = Buffer.from(blob, "base64");
  if (raw.length < 12 + 16 + 1) {
    throw new Error("invalid steam secrets blob");
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as SteamHostSecretsPayload;
}
