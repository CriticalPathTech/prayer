import type { FlagReason } from '@prayer/shared';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useFlagAction } from '../hooks/useFlagAction';

import { ConfirmDialog } from './ConfirmDialog';
import { FlagModal } from './FlagModal';
import { Icon } from './ui/Icon';

export interface PostMenuProps {
  postId: string;
  isOwnPost: boolean;
  status: 'draft' | 'published' | 'archived' | 'hidden';
  /** ISO timestamp */
  editDeadline: string;
  isTombstone: boolean;
  onDelete: () => Promise<void>;
  className?: string;
}

export function PostMenu({
  postId,
  isOwnPost,
  status,
  editDeadline,
  isTombstone,
  onDelete,
  className,
}: PostMenuProps): JSX.Element | null {
  const navigate = useNavigate();
  const flag = useFlagAction();
  const [open, setOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagSubmitted, setFlagSubmitted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const canEdit =
    isOwnPost &&
    (status === 'draft' || status === 'published') &&
    new Date(editDeadline).getTime() > Date.now();
  const canDelete = isOwnPost && status !== 'archived';
  const canReport = !isOwnPost;
  const hasAnyItem = canEdit || canDelete || canReport;

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') close();
    }
    function onDocClick(e: MouseEvent): void {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDocClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [open, close]);

  async function handleDeleteConfirm(): Promise<void> {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
      setConfirmOpen(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  async function handleFlagSubmit(input: { reason: FlagReason; note?: string }): Promise<void> {
    try {
      await flag.submit({
        targetType: 'post',
        postId,
        targetId: postId,
        reason: input.reason,
        ...(input.note !== undefined ? { note: input.note } : {}),
      });
      setFlagSubmitted(true);
    } catch {
      // useFlagAction surfaces the error via its state; modal closes.
    }
  }

  if (isTombstone || !hasAnyItem) return null;

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="More actions on this post"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--fg-3)] hover:bg-parchment-100 hover:text-[var(--fg-1)] transition-colors focus:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <Icon name="more-vertical" size={18} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Post actions"
          className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] shadow-warm-md motion-safe:animate-fade-in"
        >
          {canEdit ? (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(`/posts/${postId}/edit`);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--fg-1)] hover:bg-parchment-100"
            >
              <Icon name="pen" size={16} />
              <span>Edit</span>
            </button>
          ) : null}
          {canDelete ? (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--fg-1)] hover:bg-parchment-100"
            >
              <Icon name="archive" size={16} />
              <span>Delete</span>
            </button>
          ) : null}
          {canReport ? (
            <button
              role="menuitem"
              type="button"
              disabled={flagSubmitted}
              onClick={() => {
                setOpen(false);
                setFlagOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--fg-1)] hover:bg-parchment-100 disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <Icon name="flag" size={16} />
              <span>{flagSubmitted ? 'Reported' : 'Report'}</span>
            </button>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete post?"
        body={deleteError ?? 'This moves the post to your archive. You can no longer edit it.'}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => {
          if (!deleting) {
            setConfirmOpen(false);
            setDeleteError(null);
          }
        }}
      />
      <FlagModal open={flagOpen} onClose={() => setFlagOpen(false)} onSubmit={handleFlagSubmit} />
    </div>
  );
}
