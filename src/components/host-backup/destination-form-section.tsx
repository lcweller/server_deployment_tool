"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { HOST_BACKUP_SELECT_CLASS, WEEKDAYS } from "./constants";
import type { BackupKind, DestinationRow, InstanceOpt, ScheduleModeUi } from "./types";

type Props = {
  busy: boolean;
  hostReachable: boolean;
  destinations: DestinationRow[];
  instances: InstanceOpt[];
  editingDestinationId: string | null;
  editingPolicyId: string | null;
  kind: BackupKind;
  setKind: (k: BackupKind) => void;
  destName: string;
  setDestName: (v: string) => void;
  baseDir: string;
  setBaseDir: (v: string) => void;
  bucket: string;
  setBucket: (v: string) => void;
  region: string;
  setRegion: (v: string) => void;
  endpoint: string;
  setEndpoint: (v: string) => void;
  accessKeyId: string;
  setAccessKeyId: (v: string) => void;
  secretAccessKey: string;
  setSecretAccessKey: (v: string) => void;
  sftpHost: string;
  setSftpHost: (v: string) => void;
  sftpPort: string;
  setSftpPort: (v: string) => void;
  sftpUser: string;
  setSftpUser: (v: string) => void;
  sftpPass: string;
  setSftpPass: (v: string) => void;
  prefix: string;
  setPrefix: (v: string) => void;
  destinationEnabled: boolean;
  setDestinationEnabledState: (v: boolean) => void;
  scheduleMode: ScheduleModeUi;
  setScheduleMode: (m: ScheduleModeUi) => void;
  dailyTime: string;
  setDailyTime: (v: string) => void;
  weeklyDow: string;
  setWeeklyDow: (v: string) => void;
  weeklyTime: string;
  setWeeklyTime: (v: string) => void;
  policyInstanceId: string;
  setPolicyInstanceId: (v: string) => void;
  keepLast: string;
  setKeepLast: (v: string) => void;
  keepDays: string;
  setKeepDays: (v: string) => void;
  newPolicyDestinationId: string;
  setNewPolicyDestinationId: (v: string) => void;
  onSaveDestination: () => void | Promise<void>;
  onResetDestinationForm: () => void;
  onSavePolicyOnly: () => void | Promise<void>;
  onCreatePolicyOnly: () => void | Promise<void>;
  onTestConnection: () => void | Promise<void>;
};

export function HostBackupDestinationFormSection(p: Props) {
  const selectClass = HOST_BACKUP_SELECT_CLASS;
  const policyFieldsLocked = Boolean(p.editingDestinationId);

  return (
    <div className="space-y-3 rounded-md border border-border/60 p-3">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {p.editingDestinationId ? "Edit destination" : "New destination"}
      </p>
      {p.editingDestinationId ? (
        <p className="text-muted-foreground text-xs">
          Editing a destination updates storage settings only. Policies are unchanged unless you use
          policy actions.
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={p.destName} onChange={(e) => p.setDestName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Kind</Label>
          <select
            className={selectClass}
            value={p.kind}
            onChange={(e) => p.setKind(e.target.value as BackupKind)}
          >
            <option value="local">Local directory</option>
            <option value="s3">S3-compatible</option>
            <option value="sftp">SFTP</option>
          </select>
        </div>
      </div>
      {p.kind === "local" ? (
        <div className="space-y-1">
          <Label>Directory (optional)</Label>
          <Input
            placeholder="Defaults to ./steamline-backups on the host"
            value={p.baseDir}
            onChange={(e) => p.setBaseDir(e.target.value)}
          />
        </div>
      ) : null}
      {p.kind === "s3" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Bucket</Label>
            <Input value={p.bucket} onChange={(e) => p.setBucket(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Region</Label>
            <Input value={p.region} onChange={(e) => p.setRegion(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Endpoint (optional, MinIO / B2)</Label>
            <Input value={p.endpoint} onChange={(e) => p.setEndpoint(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Access key ID</Label>
            <Input value={p.accessKeyId} onChange={(e) => p.setAccessKeyId(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Secret access key</Label>
            <Input
              type="password"
              value={p.secretAccessKey}
              onChange={(e) => p.setSecretAccessKey(e.target.value)}
            />
          </div>
        </div>
      ) : null}
      {p.kind === "sftp" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Host</Label>
            <Input value={p.sftpHost} onChange={(e) => p.setSftpHost(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Port</Label>
            <Input value={p.sftpPort} onChange={(e) => p.setSftpPort(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Username</Label>
            <Input value={p.sftpUser} onChange={(e) => p.setSftpUser(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <Input
              type="password"
              value={p.sftpPass}
              onChange={(e) => p.setSftpPass(e.target.value)}
            />
          </div>
        </div>
      ) : null}
      <div className="space-y-1">
        <Label>Key prefix (optional)</Label>
        <Input
          value={p.prefix}
          onChange={(e) => p.setPrefix(e.target.value)}
          placeholder="steamline/my-server"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id="destination-enabled"
          type="checkbox"
          checked={p.destinationEnabled}
          onChange={(e) => p.setDestinationEnabledState(e.target.checked)}
        />
        <Label htmlFor="destination-enabled">Destination enabled</Label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Schedule</Label>
          <select
            className={selectClass}
            value={p.scheduleMode}
            disabled={policyFieldsLocked}
            onChange={(e) => p.setScheduleMode(e.target.value as ScheduleModeUi)}
          >
            <option value="manual">Manual only</option>
            <option value="hourly">Every hour</option>
            <option value="daily">Every day (UTC time)</option>
            <option value="weekly">Every week (UTC)</option>
          </select>
        </div>
        {p.scheduleMode === "daily" ? (
          <div className="space-y-1">
            <Label>Time (HH:mm UTC)</Label>
            <Input
              value={p.dailyTime}
              disabled={policyFieldsLocked}
              onChange={(e) => p.setDailyTime(e.target.value)}
            />
          </div>
        ) : null}
        {p.scheduleMode === "weekly" ? (
          <>
            <div className="space-y-1">
              <Label>Weekday (UTC)</Label>
              <select
                className={selectClass}
                value={p.weeklyDow}
                disabled={policyFieldsLocked}
                onChange={(e) => p.setWeeklyDow(e.target.value)}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.v} value={d.v}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Time (HH:mm UTC)</Label>
              <Input
                value={p.weeklyTime}
                disabled={policyFieldsLocked}
                onChange={(e) => p.setWeeklyTime(e.target.value)}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {!p.editingPolicyId ? (
          <div className="space-y-1">
            <Label>Destination for new policy</Label>
            <select
              className={selectClass}
              value={p.newPolicyDestinationId}
              disabled={policyFieldsLocked}
              onChange={(e) => p.setNewPolicyDestinationId(e.target.value)}
            >
              <option value="">Select destination…</option>
              {p.destinations
                .filter((d) => d.enabled)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.kind})
                  </option>
                ))}
            </select>
          </div>
        ) : null}
        <div className="space-y-1">
          <Label>Game server for schedule</Label>
          <select
            className={selectClass}
            value={p.policyInstanceId}
            disabled={policyFieldsLocked}
            onChange={(e) => p.setPolicyInstanceId(e.target.value)}
          >
            <option value="">—</option>
            {p.instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.status})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Keep last N (optional)</Label>
          <Input
            value={p.keepLast}
            disabled={policyFieldsLocked}
            onChange={(e) => p.setKeepLast(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Keep days (optional)</Label>
          <Input
            value={p.keepDays}
            disabled={policyFieldsLocked}
            onChange={(e) => p.setKeepDays(e.target.value)}
          />
        </div>
      </div>
      {policyFieldsLocked ? (
        <p className="text-muted-foreground text-xs">
          Policy fields are disabled while editing destination settings. Use policy actions in the
          Policies section to edit schedules/retention.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={p.busy || !p.hostReachable}
          onClick={() => void p.onSaveDestination()}
        >
          {p.editingDestinationId ? "Update destination" : "Save destination & policy"}
        </Button>
        {p.editingDestinationId ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={p.busy}
            onClick={p.onResetDestinationForm}
          >
            Cancel edit
          </Button>
        ) : null}
        {p.editingPolicyId ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={p.busy || !p.hostReachable || Boolean(p.editingDestinationId)}
            onClick={() => void p.onSavePolicyOnly()}
          >
            Save policy only
          </Button>
        ) : null}
        {!p.editingPolicyId && !p.editingDestinationId && p.destinations.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={p.busy || !p.hostReachable || !p.newPolicyDestinationId}
            onClick={() => void p.onCreatePolicyOnly()}
          >
            Add policy only
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={
            p.busy ||
            !p.hostReachable ||
            (p.editingDestinationId
              ? !p.destinations.find((d) => d.id === p.editingDestinationId)?.enabled
              : false)
          }
          onClick={() => void p.onTestConnection()}
        >
          Test connection
        </Button>
      </div>
    </div>
  );
}
