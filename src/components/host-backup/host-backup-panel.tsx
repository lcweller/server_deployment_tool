"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { weeklyExprFromUi, validatePolicyForm } from "@/lib/backup-validation";

import { HostBackupDestinationFormSection } from "./destination-form-section";
import { HostBackupDestinationsList } from "./destinations-list";
import { HostBackupManualActionsSection } from "./manual-actions-section";
import { HostBackupPoliciesList } from "./policies-list";
import { HostBackupRecentRunsList } from "./recent-runs-list";
import type { BackupKind, ScheduleModeUi } from "./types";
import { useHostBackupData } from "./use-host-backup-data";

type Props = {
  hostId: string;
  hostReachable: boolean;
};

export function HostBackupPanel({ hostId, hostReachable }: Props) {
  const { destinations, policies, runs, instances, err, setErr, load } =
    useHostBackupData(hostId);

  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<BackupKind>("local");
  const [destName, setDestName] = useState("Primary");
  const [baseDir, setBaseDir] = useState("");
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [endpoint, setEndpoint] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sftpHost, setSftpHost] = useState("");
  const [sftpPort, setSftpPort] = useState("22");
  const [sftpUser, setSftpUser] = useState("");
  const [sftpPass, setSftpPass] = useState("");
  const [prefix, setPrefix] = useState("");
  const [destinationEnabled, setDestinationEnabledState] = useState(true);

  const [scheduleMode, setScheduleMode] = useState<ScheduleModeUi>("manual");
  const [dailyTime, setDailyTime] = useState("02:00");
  const [weeklyDow, setWeeklyDow] = useState("1");
  const [weeklyTime, setWeeklyTime] = useState("02:00");
  const [policyInstanceId, setPolicyInstanceId] = useState<string>("");
  const [keepLast, setKeepLast] = useState<string>("");
  const [keepDays, setKeepDays] = useState<string>("");

  const [manualInstanceId, setManualInstanceId] = useState<string>("");
  const [manualDestId, setManualDestId] = useState<string>("");
  const [restorePath, setRestorePath] = useState("");
  const [pathHints, setPathHints] = useState<Record<string, string>>({});
  const [editingDestinationId, setEditingDestinationId] = useState<string | null>(null);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [editingPolicyDestinationId, setEditingPolicyDestinationId] = useState<string | null>(
    null
  );
  const [editingPolicyEnabled, setEditingPolicyEnabled] = useState<boolean>(true);
  const [newPolicyDestinationId, setNewPolicyDestinationId] = useState<string>("");

  useEffect(() => {
    if (!newPolicyDestinationId) return;
    const d = destinations.find((x) => x.id === newPolicyDestinationId);
    if (!d || !d.enabled) {
      setNewPolicyDestinationId("");
    }
  }, [destinations, newPolicyDestinationId]);

  useEffect(() => {
    if (manualInstanceId && !instances.some((i) => i.id === manualInstanceId)) {
      setManualInstanceId("");
    }
  }, [instances, manualInstanceId]);

  useEffect(() => {
    if (!manualDestId) return;
    const d = destinations.find((x) => x.id === manualDestId);
    if (!d || !d.enabled) {
      setManualDestId("");
    }
  }, [destinations, manualDestId]);

  function buildConfig(): Record<string, unknown> {
    if (kind === "local") {
      const o: Record<string, unknown> = {};
      if (baseDir.trim()) {
        o.baseDir = baseDir.trim();
      }
      if (prefix.trim()) {
        o.prefix = prefix.trim();
      }
      return o;
    }
    if (kind === "s3") {
      return {
        bucket: bucket.trim(),
        region: region.trim() || "us-east-1",
        ...(endpoint.trim() ? { endpoint: endpoint.trim(), forcePathStyle: true } : {}),
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
        ...(prefix.trim() ? { prefix: prefix.trim() } : {}),
      };
    }
    return {
      host: sftpHost.trim(),
      port: Number(sftpPort) || 22,
      username: sftpUser.trim(),
      password: sftpPass.trim() || undefined,
      ...(prefix.trim() ? { prefix: prefix.trim() } : {}),
    };
  }

  function buildScheduleExpr(): string | undefined {
    if (scheduleMode === "daily") {
      return dailyTime.trim() || "02:00";
    }
    if (scheduleMode === "weekly") {
      return weeklyExprFromUi(weeklyDow, weeklyTime) ?? undefined;
    }
    return undefined;
  }

  function validatePolicyInputs() {
    const v = validatePolicyForm({
      scheduleMode,
      policyInstanceId,
      dailyTime,
      weeklyDow,
      weeklyTime,
      keepLast,
      keepDays,
    });
    if (!v.ok) {
      alert(v.message);
      return { ok: false as const };
    }
    return { ok: true as const, keepLast: v.keepLast, keepDays: v.keepDays };
  }

  function resetDestinationForm() {
    setEditingDestinationId(null);
    setKind("local");
    setDestName("Primary");
    setBaseDir("");
    setBucket("");
    setRegion("us-east-1");
    setEndpoint("");
    setAccessKeyId("");
    setSecretAccessKey("");
    setSftpHost("");
    setSftpPort("22");
    setSftpUser("");
    setSftpPass("");
    setPrefix("");
    setDestinationEnabledState(true);
    setScheduleMode("manual");
    setDailyTime("02:00");
    setWeeklyDow("1");
    setWeeklyTime("02:00");
    setPolicyInstanceId("");
    setKeepLast("");
    setKeepDays("");
    setEditingPolicyId(null);
    setEditingPolicyDestinationId(null);
    setEditingPolicyEnabled(true);
    setNewPolicyDestinationId("");
  }

  function beginEditDestination(destinationId: string) {
    const d = destinations.find((x) => x.id === destinationId);
    if (!d) return;
    const cfg = d.config as Record<string, unknown>;

    setEditingPolicyId(null);
    setEditingPolicyDestinationId(null);
    setEditingPolicyEnabled(true);
    setEditingDestinationId(d.id);
    setKind((d.kind as BackupKind) ?? "local");
    setDestName(d.name);
    setPrefix(typeof cfg.prefix === "string" ? cfg.prefix : "");
    setDestinationEnabledState(Boolean(d.enabled));

    if (d.kind === "local") {
      setBaseDir(typeof cfg.baseDir === "string" ? cfg.baseDir : "");
    } else if (d.kind === "s3") {
      setBucket(typeof cfg.bucket === "string" ? cfg.bucket : "");
      setRegion(typeof cfg.region === "string" ? cfg.region : "us-east-1");
      setEndpoint(typeof cfg.endpoint === "string" ? cfg.endpoint : "");
      setAccessKeyId(typeof cfg.accessKeyId === "string" ? cfg.accessKeyId : "");
      setSecretAccessKey(
        typeof cfg.secretAccessKey === "string" ? cfg.secretAccessKey : ""
      );
    } else if (d.kind === "sftp") {
      setSftpHost(typeof cfg.host === "string" ? cfg.host : "");
      setSftpPort(String(cfg.port ?? 22));
      setSftpUser(typeof cfg.username === "string" ? cfg.username : "");
      setSftpPass(typeof cfg.password === "string" ? cfg.password : "");
    }

    setScheduleMode("manual");
    setPolicyInstanceId("");
    setKeepLast("");
    setKeepDays("");
    setDailyTime("02:00");
    setWeeklyDow("1");
    setWeeklyTime("02:00");
  }

  async function saveDestination() {
    const shouldUpdatePolicy = !editingDestinationId;
    const v = shouldUpdatePolicy
      ? validatePolicyInputs()
      : { ok: true as const, keepLast: undefined, keepDays: undefined };
    if (!v.ok) return;
    if (kind === "s3" && !bucket.trim()) {
      alert("S3 bucket is required.");
      return;
    }
    if (kind === "sftp" && !sftpHost.trim()) {
      alert("SFTP host is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_destination",
          ...(editingDestinationId ? { id: editingDestinationId } : {}),
          kind,
          name: destName.trim() || "Backup",
          config: buildConfig(),
          enabled: destinationEnabled,
          updatePolicy: shouldUpdatePolicy,
          scheduleMode,
          scheduleExpr: buildScheduleExpr(),
          keepLast: v.keepLast,
          keepDays: v.keepDays,
          instanceId: policyInstanceId || null,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? `Save failed (${res.status})`);
        return;
      }
      if (!editingDestinationId) {
        resetDestinationForm();
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function savePolicyOnly() {
    if (!editingPolicyId || !editingPolicyDestinationId) {
      alert("No policy selected for editing.");
      return;
    }
    const dest = destinations.find((d) => d.id === editingPolicyDestinationId);
    if (!dest?.enabled) {
      alert("Enable the destination before saving policy changes.");
      return;
    }
    const v = validatePolicyInputs();
    if (!v.ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_policy",
          policyId: editingPolicyId,
          destinationId: editingPolicyDestinationId,
          instanceId: policyInstanceId || null,
          scheduleMode,
          scheduleExpr: buildScheduleExpr(),
          keepLast: v.keepLast,
          keepDays: v.keepDays,
          enabled: editingPolicyEnabled,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? "Save policy failed");
        return;
      }
      resetDestinationForm();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function createPolicyOnly() {
    const destinationId = newPolicyDestinationId;
    if (!destinationId) {
      alert("Select a destination for the new policy.");
      return;
    }
    const dest = destinations.find((d) => d.id === destinationId);
    if (!dest?.enabled) {
      alert("Pick an enabled destination.");
      return;
    }
    const v = validatePolicyInputs();
    if (!v.ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_policy",
          destinationId,
          instanceId: policyInstanceId || null,
          scheduleMode,
          scheduleExpr: buildScheduleExpr(),
          keepLast: v.keepLast,
          keepDays: v.keepDays,
          enabled: true,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? "Create policy failed");
        return;
      }
      resetDestinationForm();
      await load();
    } finally {
      setBusy(false);
    }
  }

  function beginEditPolicy(policyId: string) {
    const p = policies.find((x) => x.id === policyId);
    if (!p) return;
    const dest = destinations.find((d) => d.id === p.destinationId);
    if (!dest) {
      alert("This policy’s destination no longer exists. Delete the policy or fix data.");
      return;
    }
    if (!dest.enabled) {
      alert("Enable the destination before editing this policy.");
      return;
    }
    setEditingDestinationId(null);
    setEditingPolicyId(p.id);
    setEditingPolicyDestinationId(p.destinationId);
    setEditingPolicyEnabled(Boolean(p.enabled));
    setPolicyInstanceId(p.instanceId ?? "");
    setScheduleMode((p.scheduleMode as ScheduleModeUi) ?? "manual");
    setKeepLast(p.keepLast != null ? String(p.keepLast) : "");
    setKeepDays(p.keepDays != null ? String(p.keepDays) : "");
    if (p.scheduleMode === "daily") {
      setDailyTime(p.scheduleExpr?.trim() || "02:00");
    } else {
      setDailyTime("02:00");
    }
    if (p.scheduleMode === "weekly") {
      const parts = (p.scheduleExpr ?? "1:02:00").split(":");
      setWeeklyDow(parts[0] ?? "1");
      setWeeklyTime(`${parts[1] ?? "02"}:${parts[2] ?? "00"}`);
    } else {
      setWeeklyDow("1");
      setWeeklyTime("02:00");
    }
  }

  async function testConnection() {
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_destination",
          kind,
          name: "Test",
          config: buildConfig(),
        }),
      });
      const j = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        alert(j.error ?? "Test failed");
        return;
      }
      alert(j.message ?? "Test sent — check backup history for the result.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function runBackup() {
    if (!manualInstanceId || !manualDestId) {
      alert("Select instance and destination.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "trigger_backup",
          instanceId: manualInstanceId,
          destinationId: manualDestId,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? "Backup failed");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function runRestore() {
    if (!manualInstanceId || !manualDestId || !restorePath.trim()) {
      alert("Select instance, destination, and backup path/key.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "trigger_restore",
          instanceId: manualInstanceId,
          destinationId: manualDestId,
          backupPath: restorePath.trim(),
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? "Restore failed");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function loadBackupLocation(runId: string) {
    setErr(null);
    try {
      const res = await fetch(`/api/hosts/${hostId}/backups/runs/${runId}/download`);
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? `Request failed (${res.status})`);
        return;
      }
      if (ct.includes("application/json")) {
        const j = (await res.json()) as {
          mode?: string;
          path?: string;
          message?: string;
        };
        const parts: string[] = [];
        if (j.message) parts.push(j.message);
        if (j.path) parts.push(`Path / key: ${j.path}`);
        if (j.mode) parts.push(`(${j.mode})`);
        setPathHints((h) => ({
          ...h,
          [runId]: parts.join("\n\n") || JSON.stringify(j, null, 2),
        }));
      } else {
        window.open(`/api/hosts/${hostId}/backups/runs/${runId}/download`, "_blank");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    }
  }

  async function deleteDestination(destinationId: string) {
    if (
      !window.confirm(
        "Delete this destination and its backup policy? Existing completed runs will stay in history."
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_destination",
          destinationId,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? "Delete destination failed");
        return;
      }
      if (editingDestinationId === destinationId) {
        resetDestinationForm();
      }
      if (manualDestId === destinationId) {
        setManualDestId("");
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setDestinationEnabled(destinationId: string, enabled: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_destination_enabled",
          destinationId,
          enabled,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? "Update destination failed");
        return;
      }
      if (!enabled && manualDestId === destinationId) {
        setManualDestId("");
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteRun(runId: string) {
    if (!window.confirm("Delete this backup record and remove the remote file (if applicable)?")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/backups/runs/${runId}`, {
        method: "DELETE",
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? "Delete failed");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deletePolicy(policyId: string) {
    if (!window.confirm("Delete this backup policy?")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_policy",
          policyId,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? "Delete policy failed");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setPolicyEnabled(policyId: string, enabled: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_policy_enabled",
          policyId,
          enabled,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? "Update policy failed");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/80">
      <CardHeader>
        <CardTitle className="text-base">Backups</CardTitle>
        <CardDescription>
          Configure destinations, retention, and schedules. Manual backup/restore and deleting{" "}
          <strong>local/SFTP</strong> artifacts require the agent WebSocket.{" "}
          <strong>S3</strong> backup deletes run on the server (credentials stored with the
          destination). Times for daily/weekly schedules are <strong>UTC</strong>. Set{" "}
          <code className="rounded bg-muted px-1">STEAMLINE_RCON_PASSWORD</code> on the host for
          best-effort in-game save before backup.{" "}
          <Link className="text-primary underline" href="/docs/management">
            Backup guide (docs)
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {err ? <p className="text-destructive text-xs">{err}</p> : null}
        {!hostReachable ? (
          <p className="text-amber-600 text-xs">
            Host offline — backup actions are unavailable until the agent reconnects.
          </p>
        ) : null}

        <HostBackupDestinationFormSection
          busy={busy}
          hostReachable={hostReachable}
          destinations={destinations}
          instances={instances}
          editingDestinationId={editingDestinationId}
          editingPolicyId={editingPolicyId}
          kind={kind}
          setKind={setKind}
          destName={destName}
          setDestName={setDestName}
          baseDir={baseDir}
          setBaseDir={setBaseDir}
          bucket={bucket}
          setBucket={setBucket}
          region={region}
          setRegion={setRegion}
          endpoint={endpoint}
          setEndpoint={setEndpoint}
          accessKeyId={accessKeyId}
          setAccessKeyId={setAccessKeyId}
          secretAccessKey={secretAccessKey}
          setSecretAccessKey={setSecretAccessKey}
          sftpHost={sftpHost}
          setSftpHost={setSftpHost}
          sftpPort={sftpPort}
          setSftpPort={setSftpPort}
          sftpUser={sftpUser}
          setSftpUser={setSftpUser}
          sftpPass={sftpPass}
          setSftpPass={setSftpPass}
          prefix={prefix}
          setPrefix={setPrefix}
          destinationEnabled={destinationEnabled}
          setDestinationEnabledState={setDestinationEnabledState}
          scheduleMode={scheduleMode}
          setScheduleMode={setScheduleMode}
          dailyTime={dailyTime}
          setDailyTime={setDailyTime}
          weeklyDow={weeklyDow}
          setWeeklyDow={setWeeklyDow}
          weeklyTime={weeklyTime}
          setWeeklyTime={setWeeklyTime}
          policyInstanceId={policyInstanceId}
          setPolicyInstanceId={setPolicyInstanceId}
          keepLast={keepLast}
          setKeepLast={setKeepLast}
          keepDays={keepDays}
          setKeepDays={setKeepDays}
          newPolicyDestinationId={newPolicyDestinationId}
          setNewPolicyDestinationId={setNewPolicyDestinationId}
          onSaveDestination={saveDestination}
          onResetDestinationForm={resetDestinationForm}
          onSavePolicyOnly={savePolicyOnly}
          onCreatePolicyOnly={createPolicyOnly}
          onTestConnection={testConnection}
        />

        <HostBackupDestinationsList
          destinations={destinations}
          busy={busy}
          onEdit={beginEditDestination}
          onToggleEnabled={setDestinationEnabled}
          onDelete={deleteDestination}
        />

        <HostBackupManualActionsSection
          busy={busy}
          hostReachable={hostReachable}
          instances={instances}
          destinations={destinations}
          manualInstanceId={manualInstanceId}
          setManualInstanceId={setManualInstanceId}
          manualDestId={manualDestId}
          setManualDestId={setManualDestId}
          restorePath={restorePath}
          setRestorePath={setRestorePath}
          onBackup={runBackup}
          onRestore={runRestore}
        />

        <HostBackupPoliciesList
          policies={policies}
          destinations={destinations}
          instances={instances}
          busy={busy}
          onEditPolicy={beginEditPolicy}
          onSetPolicyEnabled={setPolicyEnabled}
          onDeletePolicy={deletePolicy}
        />

        <HostBackupRecentRunsList
          hostId={hostId}
          runs={runs}
          pathHints={pathHints}
          onLoadBackupLocation={loadBackupLocation}
          onDeleteRun={deleteRun}
        />
      </CardContent>
    </Card>
  );
}
