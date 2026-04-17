export type DestinationRow = {
  id: string;
  kind: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
};

export type PolicyRow = {
  id: string;
  destinationId: string;
  instanceId: string | null;
  scheduleMode: string;
  scheduleExpr: string | null;
  keepLast: number | null;
  keepDays: number | null;
  enabled: boolean;
  lastScheduledAt?: string | null;
  nextScheduledAt?: string | null;
};

export type RunRow = {
  id: string;
  kind: string;
  status: string;
  phase: string | null;
  message: string | null;
  archivePath: string | null;
  instanceId: string | null;
  createdAt: string;
  destinationKind?: string | null;
};

export type InstanceOpt = {
  id: string;
  name: string;
  status: string;
  hostId: string | null;
};

export type BackupKind = "local" | "s3" | "sftp";

export type ScheduleModeUi = "manual" | "hourly" | "daily" | "weekly";
