import "server-only";

/** Installer must poll and user must claim within this window. */
export const GAMESERVEROS_INSTALL_SESSION_TTL_MS = 30 * 60 * 1000;

/** After claim, host pairing row stays valid long enough for disk layout + reboot + enroll. */
export const GAMESERVEROS_HOST_PAIRING_TTL_MS = 24 * 60 * 60 * 1000;
