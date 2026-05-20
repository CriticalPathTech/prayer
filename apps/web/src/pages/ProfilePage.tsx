import type { JSX } from 'react';

import { AvatarCropDialog } from '../components/AvatarCropDialog';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Field, inputClass } from '../components/ui/Field';
import { useAuth } from '../hooks/useAuth';
import { useProfileForm } from '../hooks/useProfileForm';

interface ProfilePageProps {
  /** When true, omit the page title and outer container so the form renders
   * cleanly inside a tab parent (e.g. `MemberProfilePage`). Default false. */
  embedded?: boolean;
}

export function ProfilePage({ embedded = false }: ProfilePageProps = {}): JSX.Element {
  const { me } = useAuth();
  const f = useProfileForm();

  if (!me) {
    return <p className="mx-auto max-w-feed p-6 text-sm text-[var(--fg-3)]">Loading…</p>;
  }

  return (
    <>
      <div className={embedded ? '' : 'mx-auto max-w-feed'}>
        {embedded ? null : (
          <h1 className="mb-6 font-serif text-[28px] font-semibold tracking-[-0.02em] text-[var(--fg-1)]">
            Profile
          </h1>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void f.save();
          }}
          className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4 shadow-warm-sm"
        >
          <div className="mb-6 flex items-center gap-4">
            <Avatar name={me.displayName} email={me.email} avatarUrl={me.avatarUrl} size="xl" />
            <div className="flex flex-col gap-2">
              <Button type="button" size="sm" onClick={f.openCrop}>
                Change photo
              </Button>
              <Button
                type="button"
                size="sm"
                variant="quiet"
                onClick={f.openRemove}
                disabled={!me.avatarUrl}
              >
                Remove photo
              </Button>
            </div>
          </div>
          <Field
            label="Display name"
            id="profile-display-name"
            {...(f.saveError ? { error: f.saveError } : {})}
          >
            <input
              id="profile-display-name"
              aria-label="Display name"
              value={f.displayName}
              onChange={(e) => f.setDisplayName(e.target.value)}
              maxLength={120}
              className={inputClass}
              required
            />
          </Field>
          <p className="mb-4 text-xs text-[var(--fg-3)]">
            Signed in as <strong>{me.email}</strong>. Email can&rsquo;t be changed here yet.
          </p>
          <Button type="submit" size="md" disabled={!f.dirty || f.submitting}>
            {f.submitting ? 'Saving…' : 'Save'}
          </Button>
          {f.justSaved ? (
            <span className="ml-3 text-sm text-sage-700" role="status">
              Saved.
            </span>
          ) : null}
        </form>

        <AvatarCropDialog open={f.cropOpen} onClose={f.closeCrop} onSaved={f.onAvatarSaved} />
      </div>

      <ConfirmDialog
        open={f.pendingRemove}
        label="Remove photo"
        message="Remove your profile photo? You can upload a new one anytime."
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={f.removing}
        onCancel={f.closeRemove}
        onConfirm={() => void f.confirmRemove()}
      />
    </>
  );
}
