/**
 * When a record was made, in the viewer's own local time — never the UTC portion of the stored
 * value shown as if it were local, which is what an unformatted ISO slice does.
 */
export function formatRecordedAt(iso: string | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
