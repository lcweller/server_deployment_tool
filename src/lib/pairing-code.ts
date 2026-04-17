/**
 * Human-readable pairing codes for host enrollment (GameServerOS / dashboard).
 * Alphabet excludes 0, O, 1, I, L to reduce transcription errors.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const PAIRING_TTL_MS = 15 * 60 * 1000;

export function pairingTtlMs(): number {
  return PAIRING_TTL_MS;
}

function randomChar(): string {
  const i = Math.floor(Math.random() * ALPHABET.length);
  return ALPHABET[i]!;
}

/** Produces `XXXX-XXXX` (8 symbols from ALPHABET). */
export function generatePairingCode(): string {
  let s = "";
  for (let i = 0; i < 8; i += 1) {
    s += randomChar();
  }
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Normalize user/agent input: uppercase, strip non-alphanumerics, insert hyphen after 4th char. */
export function normalizePairingCodeInput(raw: string): string {
  const alnum = raw.toUpperCase().replace(/[^2-9A-Z]/g, "");
  if (alnum.length !== 8) {
    return alnum;
  }
  return `${alnum.slice(0, 4)}-${alnum.slice(4)}`;
}

export function isValidPairingCodeFormat(normalized: string): boolean {
  if (normalized.length !== 9 || normalized[4] !== "-") {
    return false;
  }
  const parts = normalized.split("-");
  if (parts.length !== 2 || parts[0]!.length !== 4 || parts[1]!.length !== 4) {
    return false;
  }
  return /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/.test(parts.join(""));
}
