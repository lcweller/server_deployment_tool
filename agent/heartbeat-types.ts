/** JSON body returned from REST or WebSocket heartbeat. */
export type HeartbeatJson = {
  ok?: boolean;
  promotedInstanceIds?: string[];
  pendingReboot?: boolean;
  deliverSteamCredentials?: {
    steamUsername: string;
    steamPassword: string;
    steamGuardCode?: string;
  };
  deliverLinuxRootPassword?: { password: string };
};
