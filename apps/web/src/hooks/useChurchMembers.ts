import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../lib/api';

export interface MemberRow {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  role: 'member' | 'moderator' | 'super_user';
  joinedAt: string;
}

export interface UseChurchMembersResult {
  members: MemberRow[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useChurchMembers(): UseChurchMembersResult {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ members: MemberRow[] }>('/admin/church/members');
      setMembers(res.members);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { members, loading, error, refresh };
}
