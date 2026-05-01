import { useCallback, useState } from 'react';

import { apiFetch } from '../lib/api';

export interface UpdatedOrg {
  id: string;
  slug: string;
  displayName: string;
}

export interface UseChurchSettingsResult {
  updateDisplayName: (displayName: string) => Promise<UpdatedOrg>;
  saving: boolean;
  error: Error | null;
}

export function useChurchSettings(): UseChurchSettingsResult {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateDisplayName = useCallback(async (displayName: string): Promise<UpdatedOrg> => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ org: UpdatedOrg }>('/admin/church/settings', {
        method: 'PATCH',
        body: JSON.stringify({ displayName }),
      });
      return res.org;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { updateDisplayName, saving, error };
}
