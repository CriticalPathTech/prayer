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
  /** Whether this org requires moderator approval for new posts. False until first fetch. */
  currentRequiresPostApproval: boolean;
  /** Number of super_users in this org. 0 until first fetch. */
  superUserCount: number;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

interface ChurchMembersResponse {
  members: MemberRow[];
  org: { displayName: string; requiresPostApproval: boolean };
  superUserCount: number;
}

export function useChurchMembers(): UseChurchMembersResult {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(null);
  const [currentRequiresPostApproval, setCurrentRequiresPostApproval] = useState(false);
  const [superUserCount, setSuperUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ChurchMembersResponse>('/admin/church/members');
      setMembers(res.members);
      setCurrentDisplayName(res.org.displayName);
      setCurrentRequiresPostApproval(res.org.requiresPostApproval);
      setSuperUserCount(res.superUserCount);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    members,
    currentDisplayName,
    currentRequiresPostApproval,
    superUserCount,
    loading,
    error,
    refresh,
  };
}
