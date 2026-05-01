import { useEffect, useState, type JSX } from 'react';
import { Navigate } from 'react-router-dom';

import { RemoveMemberDialog } from '../components/RemoveMemberDialog';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Field';
import { Pill } from '../components/ui/Pill';
import { useAuth } from '../hooks/useAuth';
import { useChurchMembers, type MemberRow } from '../hooks/useChurchMembers';
import { useChurchSettings } from '../hooks/useChurchSettings';
import { useRemoveMember } from '../hooks/useRemoveMember';

export function AdminChurchPage(): JSX.Element {
  const { me } = useAuth();
  const { members, currentDisplayName, loading, refresh } = useChurchMembers();
  const { updateDisplayName, saving } = useChurchSettings();
  const { removeMember, removing } = useRemoveMember();
  const [target, setTarget] = useState<MemberRow | null>(null);
  const [draftName, setDraftName] = useState<string>('');
  const [hydrated, setHydrated] = useState(false);

  // Pre-fill the draft input with the current org name once on first fetch.
  // After save, refresh() updates currentDisplayName which we sync into the
  // draft so the Save button correctly disables (draft === current).
  useEffect(() => {
    if (currentDisplayName === null) return;
    if (!hydrated) {
      setDraftName(currentDisplayName);
      setHydrated(true);
    } else if (draftName === '' || draftName === currentDisplayName) {
      // Sync after save: only overwrite if user hasn't typed something new.
      setDraftName(currentDisplayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDisplayName]);

  if (!me) return <div>Loading…</div>;
  if (me.role !== 'super_user') return <Navigate to="/" replace />;

  const trimmed = draftName.trim();
  const canSave = trimmed.length > 0 && trimmed !== currentDisplayName && !saving;

  async function onSaveSettings(): Promise<void> {
    if (!canSave) return;
    await updateDisplayName(trimmed);
    await refresh();
  }

  async function onConfirmRemove(): Promise<void> {
    if (!target) return;
    try {
      await removeMember(target.id);
      setTarget(null);
      await refresh();
    } catch {
      // error surfaces via the hook's error state; keep dialog open for retry.
    }
  }

  return (
    <div className="mx-auto max-w-feed">
      <h1 className="mb-6 font-serif text-[28px] font-semibold tracking-[-0.02em] text-[var(--fg-1)]">
        Church management
      </h1>

      {/* Settings */}
      <section className="mb-8 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
        <h2 className="mb-3 font-serif text-lg font-medium">Church settings</h2>
        <Field label="Display name">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={60}
            disabled={currentDisplayName === null}
            className={inputClass}
          />
        </Field>
        <div className="mt-2 flex items-center gap-3">
          <Button onClick={() => void onSaveSettings()} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </section>

      {/* Members */}
      <section className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
        <h2 className="mb-3 font-serif text-lg font-medium">Members</h2>
        {loading ? (
          <div className="text-sm text-[var(--fg-3)]">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--fg-3)]">
                <th className="w-10 py-2"></th>
                <th className="py-2">Name</th>
                <th className="py-2">Email</th>
                <th className="py-2">Role</th>
                <th className="w-24 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-[var(--border-soft)]">
                  <td className="py-2">
                    <Avatar
                      name={m.displayName}
                      email={m.email}
                      avatarUrl={m.avatarUrl}
                      size="sm"
                    />
                  </td>
                  <td className="py-2 text-[var(--fg-1)]">{m.displayName}</td>
                  <td className="py-2 text-[var(--fg-2)]">{m.email}</td>
                  <td className="py-2">
                    <Pill>{m.role}</Pill>
                  </td>
                  <td className="py-2 text-right">
                    {m.id !== me.id ? (
                      <Button variant="quiet" onClick={() => setTarget(m)}>
                        Remove
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {target ? (
        <RemoveMemberDialog
          member={target}
          onConfirm={() => void onConfirmRemove()}
          onCancel={() => setTarget(null)}
          removing={removing}
        />
      ) : null}
    </div>
  );
}
