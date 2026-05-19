import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import type { Notification } from '../hooks/useNotifications';

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface CommentPayload {
  comment_id: string;
  post_id: string;
  commenter_display_name: string;
  preview: string;
}

const BASE = 'block border-l-4 px-3.5 py-2.5 transition-colors hover:bg-parchment-100';

export interface NotificationItemProps {
  notification: Notification;
  onClick: (id: string) => void;
}

export function NotificationItem({ notification, onClick }: NotificationItemProps): JSX.Element {
  const unread = notification.read_at === null;
  const titleClass = `text-[13px] text-[var(--fg-1)] ${unread ? 'font-semibold' : 'font-medium'}`;
  const metaClass = 'truncate text-xs text-[var(--fg-4)] mt-0.5';

  if (notification.type === 'comment.created') {
    const p = notification.payload as unknown as CommentPayload;
    const border = unread ? 'border-l-vesper-500' : 'border-l-transparent';
    const bg = unread ? 'bg-vesper-50/50' : '';
    return (
      <Link
        to={`/posts/${p.post_id}`}
        onClick={() => onClick(notification.id)}
        className={`${BASE} ${border} ${bg}`}
      >
        <div className={titleClass}>{p.commenter_display_name} commented on your request</div>
        <div className={metaClass}>
          &ldquo;{p.preview}&rdquo; · {relativeTime(notification.created_at)}
        </div>
      </Link>
    );
  }

  if (notification.type === 'flag.created') {
    const p = notification.payload as unknown as {
      target_type: 'post' | 'comment';
      reason: string;
      target_preview: string;
      post_id: string;
    };
    const border = unread ? 'border-l-warm-300' : 'border-l-transparent';
    const bg = unread ? 'bg-warm-100/40' : '';
    return (
      <Link
        to="/mod/queue"
        onClick={() => onClick(notification.id)}
        className={`${BASE} ${border} ${bg}`}
      >
        <div className={titleClass}>A member flagged a {p.target_type}</div>
        <div className={metaClass}>
          &ldquo;{p.target_preview}&rdquo; · {p.reason}
        </div>
      </Link>
    );
  }

  if (notification.type === 'moderator.hide') {
    const p = notification.payload as unknown as {
      target_type: 'post' | 'comment';
      post_id: string;
      source: 'auto' | 'manual';
    };
    const border = unread ? 'border-l-dawn-400' : 'border-l-transparent';
    const bg = unread ? 'bg-dawn-50' : '';
    return (
      <Link
        to={`/posts/${p.post_id}`}
        onClick={() => onClick(notification.id)}
        className={`${BASE} ${border} ${bg}`}
      >
        <div className={titleClass}>Your {p.target_type} was hidden by a moderator</div>
        <div className={metaClass}>{relativeTime(notification.created_at)}</div>
      </Link>
    );
  }

  if (notification.type === 'post.rejected') {
    const p = notification.payload as unknown as {
      post_id: string;
      moderation_note: string | null;
      moderated_by: string;
      body_preview: string;
    };
    const border = unread ? 'border-l-warm-300' : 'border-l-transparent';
    const bg = unread ? 'bg-warm-100/40' : '';
    return (
      <Link
        to="/me/archive"
        onClick={() => onClick(notification.id)}
        className={`${BASE} ${border} ${bg}`}
      >
        <div className={titleClass}>A moderator declined your prayer request</div>
        <div className={metaClass}>
          &ldquo;{p.body_preview}&rdquo;
          {p.moderation_note ? ` · ${p.moderation_note}` : ''} · {relativeTime(notification.created_at)}
        </div>
      </Link>
    );
  }

  if (notification.type === 'invite.accepted') {
    const p = notification.payload as unknown as {
      invitation_id: string;
      invitee_id: string;
      invitee_display_name: string;
    };
    const border = unread ? 'border-l-sage-500' : 'border-l-transparent';
    const bg = unread ? 'bg-sage-100/40' : '';
    return (
      <Link
        to="/me/invites"
        onClick={() => onClick(notification.id)}
        className={`${BASE} ${border} ${bg}`}
      >
        <div className={titleClass}>{p.invitee_display_name} accepted your invite</div>
        <div className={metaClass}>{relativeTime(notification.created_at)}</div>
      </Link>
    );
  }

  return (
    <div className={`${BASE} border-l-transparent`}>
      <div className={titleClass}>New notification</div>
      <div className={metaClass}>{relativeTime(notification.created_at)}</div>
    </div>
  );
}
