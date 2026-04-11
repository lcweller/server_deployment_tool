/**
 * Ports reserved for a game server instance on a host (control plane + agent).
 */
export type AllocatedPorts = {
  game?: number;
  query?: number;
  rcon?: number;
};
