import { useEffect, useState } from 'react';

import { fetchOrgBranding } from '../lib/api';

export interface OrgBrandingState {
  /** The org's customised display name, or null while loading or when the
   *  host doesn't resolve to a known org (apex domain, unknown subdomain). */
  displayName: string | null;
}

/** Pre-auth-friendly fetch of the church's branding from `GET /org`. Used
 *  by the login screen so the user sees their church's display name even
 *  though they aren't signed in yet. Errors are swallowed — pre-auth pages
 *  fall back to the "Prayer" wordmark when the host is unknown. */
export function useOrgBranding(): OrgBrandingState {
  const [displayName, setDisplayName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchOrgBranding()
      .then((res) => {
        if (!cancelled) setDisplayName(res.displayName || null);
      })
      .catch(() => {
        // Unknown host (apex, untrusted subdomain) or transient network error —
        // both surface as "no display name" and the page renders without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { displayName };
}
