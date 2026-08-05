import type { JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { ModTabs } from '../components/ModTabs';
import { PostImages } from '../components/PostImages';
import { useAuth } from '../hooks/useAuth';
import { useModQueue } from '../hooks/useModQueue';
import { isPrivilegedRole } from '../lib/roles';

/** "Flagged" = posts/comments members have reported that are NOT yet hidden.
 * The Hidden tab (/mod/hidden) shows the hidden bucket separately. */
export function ModQueuePage(): JSX.Element {
  const { me } = useAuth();
  const queue = useModQueue('pending');

  if (!me) return <div>Loading…</div>;
  if (!isPrivilegedRole(me.role)) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-feed space-y-3">
      <ModTabs />
      {queue.loading ? <div>Loading…</div> : null}
      {queue.error ? <div className="text-red-600">{queue.error}</div> : null}
      {queue.items.length === 0 && !queue.loading ? (
        <div className="text-sm text-gray-500">Nothing here.</div>
      ) : null}
      <ul className="space-y-2">
        {queue.items.map((it) => (
          <li key={`${it.target_type}-${it.target_id}`} className="rounded border p-3">
            <div className="text-xs text-gray-500">
              {it.target_type} · {it.flag_count} flag{it.flag_count === 1 ? '' : 's'} ·{' '}
              {it.reasons.join(', ')}
            </div>
            <p className="mt-1 text-sm">{it.preview}</p>
            <PostImages images={it.images} variant="detail" />
            <div className="mt-2 flex gap-2 text-xs">
              <button
                onClick={() => void queue.hideTarget(it.target_type, it.target_id)}
                className="rounded border px-2 py-1 hover:bg-gray-100"
              >
                Hide
              </button>
              <button
                onClick={() => void queue.dismissFlags(it.target_type, it.target_id)}
                className="rounded border px-2 py-1 hover:bg-gray-100"
              >
                Dismiss flags
              </button>
              <Link
                to={`/posts/${it.post_id}`}
                className="rounded border px-2 py-1 hover:bg-gray-100"
              >
                Open thread
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
