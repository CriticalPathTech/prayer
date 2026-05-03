import type { JSX } from 'react';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import { MobileDrawer } from './MobileDrawer';

export interface MobileLayoutContext {
  openDrawer: () => void;
}

export function MobileLayout(): JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const ctx: MobileLayoutContext = {
    openDrawer: () => setDrawerOpen(true),
  };
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-page)] text-[var(--fg-2)] font-sans">
      <Outlet context={ctx} />
      {drawerOpen ? <MobileDrawer onClose={() => setDrawerOpen(false)} /> : null}
    </div>
  );
}
