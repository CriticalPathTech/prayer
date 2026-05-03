import type { JSX } from 'react';

import { AvatarCropDialog } from '../../components/AvatarCropDialog';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field, inputClass } from '../../components/ui/Field';
import { useAuth } from '../../hooks/useAuth';
import { useProfileForm } from '../../hooks/useProfileForm';

import { MobilePageHeader } from './MobilePageHeader';

export function MobileProfilePage(): JSX.Element {
  const { me } = useAuth();
  const f = useProfileForm();

  if (!me) {
    return (
      <>
        <MobilePageHeader variant={{ kind: 'back', title: 'Profile' }} />
        <div className="px-4 py-16 text-center text-sm text-[var(--fg-3)]">Loading…</div>
      </>
    );
  }

  return (
    <>
      <MobilePageHeader variant={{ kind: 'back', title: 'Profile' }} />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void f.save();
          }}
          className="flex flex-col gap-4 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4 shadow-warm-sm"
        >
          <div className="flex items-center gap-4">
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
            id="mobile-profile-display-name"
            {...(f.saveError ? { error: f.saveError } : {})}
          >
            <input
              id="mobile-profile-display-name"
              aria-label="Display name"
              value={f.displayName}
              onChange={(e) => f.setDisplayName(e.target.value)}
              maxLength={120}
              className={inputClass}
              required
            />
          </Field>
          <p className="text-xs text-[var(--fg-3)]">
            Signed in as <strong>{me.email}</strong>. Email can&rsquo;t be changed here yet.
          </p>
          <Button type="submit" size="md" disabled={!f.dirty || f.submitting}>
            {f.submitting ? 'Saving…' : 'Save'}
          </Button>
          {f.justSaved ? (
            <span className="text-sm text-sage-700" role="status">
              Saved.
            </span>
          ) : null}
        </form>
      </div>

      <AvatarCropDialog open={f.cropOpen} onClose={f.closeCrop} onSaved={f.onAvatarSaved} />

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
