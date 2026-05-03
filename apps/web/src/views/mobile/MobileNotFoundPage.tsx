import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';

import { MobilePageHeader } from './MobilePageHeader';

export function MobileNotFoundPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-page)] text-[var(--fg-2)] font-sans">
      <MobilePageHeader
        variant={{ kind: 'close', title: 'Not found', onClose: () => navigate('/') }}
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-6 text-center">
        <Icon name="pray" size={32} className="opacity-[0.12] scale-[2]" />
        <p className="font-serif text-[18px] text-[var(--fg-3)]">
          We couldn&apos;t find that page.
        </p>
        <p className="text-sm text-[var(--fg-3)]">
          The link may be wrong, or this page is no longer available.
        </p>
        <Button type="button" onClick={() => navigate('/')}>
          Go home
        </Button>
      </div>
    </div>
  );
}
