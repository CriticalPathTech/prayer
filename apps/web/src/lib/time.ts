export function formatAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  const days = Math.floor(d / 86400);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Human label for a moderator-extension / pin duration, matching the picker
 * choices (1 / 3 / 7 / 14 / 30 days). Used in notification copy
 * ("…extended your prayer for another 2 weeks"). */
export function durationLabel(days: number): string {
  switch (days) {
    case 1:
      return '1 day';
    case 3:
      return '3 days';
    case 7:
      return '1 week';
    case 14:
      return '2 weeks';
    case 30:
      return '1 month';
    default:
      return `${days} days`;
  }
}

export function expiringSoon(iso: string | null): string | null {
  if (!iso) return null;
  const d = (new Date(iso).getTime() - Date.now()) / 86400000;
  if (d < 0) return null;
  if (d < 1) return 'Expires today';
  if (d < 7) {
    // Round (not ceil) so a "1 day" expiry that ends up at 1.0003 days
    // remaining (the 30s buffer in ComposePage's buildExpiresAt) still
    // displays as "1 day" instead of "2 days".
    const days = Math.round(d);
    return `Expires in ${days} ${days === 1 ? 'day' : 'days'}`;
  }
  return null;
}
