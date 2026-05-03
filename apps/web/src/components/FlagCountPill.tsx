import type { JSX } from 'react';
import { Link } from 'react-router-dom';

export interface FlagCountPillProps {
  count: number;
  targetId: string;
}

export function FlagCountPill({ count, targetId }: FlagCountPillProps): JSX.Element | null {
  if (count <= 0) return null;
  return (
    <Link
      to={`/mod/queue?highlight=${targetId}`}
      className="rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-900 hover:bg-amber-300"
    >
      Flagged ({count})
    </Link>
  );
}
