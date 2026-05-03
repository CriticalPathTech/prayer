import { useEffect, useState } from 'react';

import { fetchMyInvites, type MyInvitesResponse } from '../lib/api';

export interface UseMyInvitesResult {
  data: MyInvitesResponse | null;
  loading: boolean;
  error: string | null;
}

export function useMyInvites(): UseMyInvitesResult {
  const [data, setData] = useState<MyInvitesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchMyInvites()
      .then((d) => {
        if (active) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : 'Failed to load');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return { data, loading, error };
}
