/**
 * Human-facing instance status for the dashboard.
 * API values stay `running` / `installing` etc.; "running" here means provisioning finished,
 * not necessarily that a dedicated server is accepting players unless the agent started one.
 */
export function instanceDashboardStatusLabel(
  status: string,
  provisionMessage: string | null | undefined
): string {
  switch (status) {
    case "running":
      if (
        provisionMessage?.toLowerCase().includes("dedicated command started")
      ) {
        return "Deployed & running";
      }
      return "Install complete";
    case "installing":
      return "Installing";
    case "queued":
      return "Queued";
    case "draft":
      return "Draft";
    case "failed":
      return "Failed";
    case "pending_delete":
      return "Removing";
    default:
      return status;
  }
}
