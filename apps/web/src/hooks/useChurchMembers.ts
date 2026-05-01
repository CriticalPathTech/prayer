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
  /** Current org display name, fresh from DB. Null until first fetch. */
  currentDisplayName: string | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

interface ChurchMembersResponse {
  members: MemberRow[];
  org: { displayName: string };
}

export function useChurchMembers(): UseChurchMembersResult {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ChurchMembersResponse>('/admin/church/members');
      setMembers(res.members);
      setCurrentDisplayName(res.org.displayName);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { members, currentDisplayName, loading, error, refresh };
}
