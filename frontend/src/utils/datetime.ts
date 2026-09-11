export function formatRunDateTime(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function formatElapsed(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
  isActive: boolean,
): string {
  const dash = '\u2014';
  if (!startedAt) return dash;
  const start = new Date(startedAt).getTime();
  const end = completedAt
    ? new Date(completedAt).getTime()
    : isActive
      ? Date.now()
      : Number.NaN;
  if (Number.isNaN(end)) return dash;
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  if (minutes < 1) return '<1m';
  return `${minutes}m`;
}
