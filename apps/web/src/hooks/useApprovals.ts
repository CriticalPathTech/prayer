import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from 'react';

import { listApprovals, type ApprovalItem } from '../lib/api';

export type { ApprovalItem };

export interface UseApprovalsResult {
  items: ApprovalItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setItems: Dispatch<SetStateAction<ApprovalItem[]>>;
}

export function useApprovals(): UseApprovalsResult {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listApprovals();
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, loading, error, refresh, setItems };
}
