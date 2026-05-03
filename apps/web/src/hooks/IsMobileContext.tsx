import type { JSX, ReactNode } from 'react';
import { createContext, useContext } from 'react';

import { useIsMobile } from './useIsMobile';

// AdaptiveLayout and Adaptive<Page> wrappers all need the same isMobile value
// within a single render. If each wrapper called useIsMobile() independently,
// a viewport flip could land mid-render and leave the desktop Layout in the
// tree (whose Outlet has no context) while a child page already swapped to
// the mobile component — causing useOutletContext to return undefined. The
// provider broadcasts a single value so all consumers stay consistent.

const IsMobileContext = createContext<boolean>(false);

export function IsMobileProvider({ children }: { children: ReactNode }): JSX.Element {
  const isMobile = useIsMobile();
  return <IsMobileContext.Provider value={isMobile}>{children}</IsMobileContext.Provider>;
}

export function useIsMobileShared(): boolean {
  return useContext(IsMobileContext);
}
