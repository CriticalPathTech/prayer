import type { JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { ModTabs } from '../components/ModTabs';
import { useAuth } from '../hooks/useAuth';
import { useModQueue } from '../hooks/useModQueue';
import { isPrivilegedRole } from '../lib/roles';

/** "Hidden" = posts/comments currently hidden from members, regardless of
 * whether they were auto-hidden (≥2 flags) or manually hidden by a mod. */
export function ModHiddenPage(): JSX.Element {
  const { me } = useAuth();
  const queue = useModQueue('hidden');

  if (!me) return <div>Loading…</div>;
  if (!isPrivilegedRole(me.role)) return <Navigate to="/" replace />;

  return (
    <div className="space-y-3">
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
              <span className="text-ember-600">
                {it.hide_source === 'auto' ? 'Auto-hidden' : 'Manually hidden'}
              </span>
              {it.reasons.length > 0 ? <> · {it.reasons.join(', ')}</> : null}
            </div>
            <p className="mt-1 text-sm">{it.preview}</p>
            <div className="mt-2 flex gap-2 text-xs">
              <button
                onClick={() => void queue.unhideTarget(it.target_type, it.target_id)}
                className="rounded border px-2 py-1 hover:bg-gray-100"
              >
                Unhide
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
