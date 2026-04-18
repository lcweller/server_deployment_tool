export const HOST_DETAIL_TAB_IDS = [
  "overview",
  "servers",
  "backups",
  "tools",
] as const;

export type HostDetailTabId = (typeof HOST_DETAIL_TAB_IDS)[number];

export function isHostDetailTabId(value: string): value is HostDetailTabId {
  return (HOST_DETAIL_TAB_IDS as readonly string[]).includes(value);
}
