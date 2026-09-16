export function elapsedLabel(since: string | null, now = new Date()): string {
  if (!since) return "";
  const milliseconds = Math.max(0, now.getTime() - new Date(since).getTime());
  const hours = Math.floor(milliseconds / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(milliseconds / 60_000))}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function isAgingWarning(since: string | null, now = new Date()): boolean {
  return Boolean(since) && now.getTime() - new Date(since!).getTime() >= 3 * 86_400_000;
}
