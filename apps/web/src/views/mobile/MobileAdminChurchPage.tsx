import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../components/ui/Button';

import { MobilePageHeader } from './MobilePageHeader';

export function MobileAdminChurchPage(): JSX.Element {
  const navigate = useNavigate();
  const desktopUrl =
    typeof window !== 'undefined'
      ? `https://${window.location.hostname}/admin/church`
      : 'https://<your-church>.prays.online/admin/church';

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-page)] text-[var(--fg-2)] font-sans">
      <MobilePageHeader
        variant={{ kind: 'close', title: 'Church admin', onClose: () => navigate('/') }}
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-6 text-center">
        <h1 className="font-serif text-[20px] text-[var(--fg-1)]">Desktop only</h1>
        <p className="max-w-sm text-sm text-[var(--fg-3)]">
          Church management is a desktop-only tool. Please sign in from a laptop or desktop browser
          to manage members and church settings.
        </p>
        <p className="max-w-sm break-all text-xs text-[var(--fg-4)]">
          <code className="font-mono">{desktopUrl}</code>
        </p>
        <Button type="button" onClick={() => navigate('/')}>
          Back to feed
        </Button>
      </div>
    </div>
  );
}
