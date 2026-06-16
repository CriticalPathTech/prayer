import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';

import { fetchOrgBranding, type OrgLogo } from '../lib/api';

interface OrgLogoValue {
  logo: OrgLogo | null;
  refresh: () => Promise<void>;
}

const OrgLogoContext = createContext<OrgLogoValue>({ logo: null, refresh: async () => {} });

/** Fetches the org's custom logo once (public `GET /org`) and shares it with
 * every brand surface via context, so the logo loads with a single request
 * regardless of how many LogoMark instances render. Pre-auth friendly. */
export function OrgLogoProvider({ children }: { children: ReactNode }): JSX.Element {
  const [logo, setLogo] = useState<OrgLogo | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchOrgBranding();
      setLogo(res.logo ?? null);
    } catch {
      // Unknown host / network error — fall back to the default icon.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <OrgLogoContext.Provider value={{ logo, refresh }}>{children}</OrgLogoContext.Provider>;
}

export function useOrgLogo(): OrgLogo | null {
  return useContext(OrgLogoContext).logo;
}

/** Returns a function that re-fetches the org logo — call after a save/remove
 * so brand surfaces update without a full page reload. */
export function useRefreshOrgLogo(): () => Promise<void> {
  return useContext(OrgLogoContext).refresh;
}
