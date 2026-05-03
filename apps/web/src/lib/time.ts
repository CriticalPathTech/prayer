export function formatAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  const days = Math.floor(d / 86400);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function expiringSoon(iso: string | null): string | null {
  if (!iso) return null;
  const d = (new Date(iso).getTime() - Date.now()) / 86400000;
  if (d < 0) return null;
  if (d < 1) return 'Expires today';
  if (d < 7) return `Expires in ${Math.ceil(d)} days`;
  return null;
}
