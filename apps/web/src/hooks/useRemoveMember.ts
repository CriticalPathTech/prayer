import { useCallback, useState } from 'react';

import { apiFetch } from '../lib/api';

export interface UseRemoveMemberResult {
  removeMember: (userId: string) => Promise<void>;
  removing: boolean;
  error: Error | null;
}

export function useRemoveMember(): UseRemoveMemberResult {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const removeMember = useCallback(async (userId: string): Promise<void> => {
    setRemoving(true);
    setError(null);
    try {
      await apiFetch(`/admin/church/members/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setRemoving(false);
    }
  }, []);

  return { removeMember, removing, error };
}
