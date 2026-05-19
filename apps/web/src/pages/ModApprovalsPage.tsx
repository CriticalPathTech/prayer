import type { JSX } from 'react';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { ModTabs } from '../components/ModTabs';
import { PendingCard } from '../components/PendingCard';
import { useApprovals, type ApprovalItem } from '../hooks/useApprovals';
import { useAuth } from '../hooks/useAuth';
import { approvePost, rejectPost, skipPost } from '../lib/api';
import { isPrivilegedRole } from '../lib/roles';

export function ModApprovalsPage(): JSX.Element {
  const { me } = useAuth();
  const { items, loading, error: loadError, setItems } = useApprovals();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  if (!me) return <div>Loading…</div>;
  if (!isPrivilegedRole(me.role)) return <Navigate to="/" replace />;

  function clearError(id: string): void {
    setActionErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleApprove(id: string): Promise<void> {
    clearError(id);
    // Optimistic remove
    const snapshot = items;
    setItems((prev) => prev.filter((it) => it.id !== id));
    setBusyId(id);
    try {
      await approvePost(id);
    } catch (e) {
      // Restore on error
      setItems(snapshot);
      setActionErrors((prev) => ({
        ...prev,
        [id]: e instanceof Error ? e.message : 'Failed to approve',
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string, note: string): Promise<void> {
    clearError(id);
    const snapshot = items;
    setItems((prev) => prev.filter((it) => it.id !== id));
    setBusyId(id);
    try {
      await rejectPost(id, note !== '' ? note : undefined);
    } catch (e) {
      setItems(snapshot);
      setActionErrors((prev) => ({
        ...prev,
        [id]: e instanceof Error ? e.message : 'Failed to decline',
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSkip(id: string): Promise<void> {
    clearError(id);
    setBusyId(id);
    try {
      await skipPost(id);
      // Move the skipped item to the end of the list with skipped_by_me = true
      setItems((prev) => {
        const idx = prev.findIndex((it) => it.id === id);
        if (idx === -1) return prev;
        const updated: ApprovalItem = { ...prev[idx]!, skipped_by_me: true };
        const rest = prev.filter((it) => it.id !== id);
        return [...rest, updated];
      });
    } catch (e) {
      setActionErrors((prev) => ({
        ...prev,
        [id]: e instanceof Error ? e.message : 'Failed to skip',
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-feed space-y-3">
      <ModTabs />

      {loadError ? <p className="text-sm text-ember-600">{loadError}</p> : null}
      {loading ? <p className="text-sm text-[var(--fg-3)]">Loading…</p> : null}

      {!loading && items.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <p className="font-serif text-[18px] text-[var(--fg-2)]">
            Inbox zero &mdash; you&apos;re caught up.
          </p>
          <p className="text-sm text-[var(--fg-3)]">
            New prayer requests will appear here as members submit them.
          </p>
        </div>
      ) : null}

      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <PendingCard
              item={item}
              onApprove={(id) => void handleApprove(id)}
              onReject={(id, note) => void handleReject(id, note)}
              onSkip={(id) => void handleSkip(id)}
              busy={busyId === item.id}
              error={actionErrors[item.id] ?? null}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
