import { useCallback, useState } from 'react';

import { apiFetch } from '../lib/api';
import type { Role } from '../lib/roles';

import type { MemberRow } from './useChurchMembers';

export type { Role };

export interface UseChangeMemberRoleResult {
  changeRole: (userId: string, role: Role) => Promise<MemberRow>;
  saving: boolean;
  error: Error | null;
}

export function useChangeMemberRole(): UseChangeMemberRoleResult {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const changeRole = useCallback(async (userId: string, role: Role): Promise<MemberRow> => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ member: MemberRow }>(
        `/admin/church/members/${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        },
      );
      return res.member;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { changeRole, saving, error };
}
