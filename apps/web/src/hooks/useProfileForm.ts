import { useEffect, useState } from 'react';

import { deleteMyAvatar, updateMyProfile } from '../lib/api';
import { authErrorCopy } from '../lib/authErrorCopy';

import { useAuth } from './useAuth';

export interface UseProfileFormResult {
  displayName: string;
  setDisplayName: (s: string) => void;
  dirty: boolean;
  submitting: boolean;
  saveError: string | null;
  justSaved: boolean;
  save: () => Promise<void>;

  cropOpen: boolean;
  openCrop: () => void;
  closeCrop: () => void;
  onAvatarSaved: () => void;

  pendingRemove: boolean;
  openRemove: () => void;
  closeRemove: () => void;
  removing: boolean;
  confirmRemove: () => Promise<void>;
}

export function useProfileForm(): UseProfileFormResult {
  const { me, refreshMe } = useAuth();
  const initialName = me?.displayName ?? '';
  const [displayName, setDisplayName] = useState<string>(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setDisplayName(me?.displayName ?? '');
  }, [me?.displayName]);

  async function save(): Promise<void> {
    setSubmitting(true);
    setSaveError(null);
    setJustSaved(false);
    try {
      await updateMyProfile({ display_name: displayName });
      await refreshMe();
      setJustSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : authErrorCopy(e).text);
    } finally {
      setSubmitting(false);
    }
  }

  function onAvatarSaved(): void {
    void refreshMe();
    setCropOpen(false);
  }

  async function confirmRemove(): Promise<void> {
    setRemoving(true);
    try {
      await deleteMyAvatar();
      await refreshMe();
      setPendingRemove(false);
    } finally {
      setRemoving(false);
    }
  }

  return {
    displayName,
    setDisplayName,
    dirty: displayName !== initialName,
    submitting,
    saveError,
    justSaved,
    save,
    cropOpen,
    openCrop: () => setCropOpen(true),
    closeCrop: () => setCropOpen(false),
    onAvatarSaved,
    pendingRemove,
    openRemove: () => setPendingRemove(true),
    closeRemove: () => setPendingRemove(false),
    removing,
    confirmRemove,
  };
}
