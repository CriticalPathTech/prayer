import { useRef, useState } from 'react';

import {
  grantInviteCodeMod,
  listInviteCodesMod,
  retireInviteCodeMod,
  searchUsersMod,
  type ModUserSearchResult,
  type MyInvitesCodeRow,
} from '../lib/api';

export interface UseModInvitesResult {
  query: string;
  setQuery: (s: string) => void;
  results: ModUserSearchResult[];
  search: () => Promise<void>;
  selected: ModUserSearchResult | null;
  selectUser: (u: ModUserSearchResult) => Promise<void>;
  codes: MyInvitesCodeRow[];
  seatCap: number;
  setSeatCap: (n: number) => void;
  grant: () => Promise<void>;
  pendingRetire: string | null;
  openRetire: (codeId: string) => void;
  closeRetire: () => void;
  confirmRetire: () => Promise<void>;
  toast: string | null;
  error: string | null;
}

export function useModInvites(): UseModInvitesResult {
  const [query, setQuery] = useState('');
  const queryRef = useRef('');
  const [results, setResults] = useState<ModUserSearchResult[]>([]);
  const [selected, setSelected] = useState<ModUserSearchResult | null>(null);
  const [codes, setCodes] = useState<MyInvitesCodeRow[]>([]);
  const [seatCap, setSeatCap] = useState(3);
  const [pendingRetire, setPendingRetire] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(): Promise<void> {
    setError(null);
    const q = queryRef.current.trim();
    if (q.length === 0) {
      setResults([]);
      return;
    }
    try {
      setResults(await searchUsersMod(q));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    }
  }

  async function selectUser(u: ModUserSearchResult): Promise<void> {
    setSelected(u);
    setResults([]);
    queryRef.current = u.display_name;
    setQuery(u.display_name);
    try {
      setCodes(await listInviteCodesMod(u.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load codes');
    }
  }

  async function grant(): Promise<void> {
    if (!selected) return;
    setError(null);
    setToast(null);
    try {
      const r = await grantInviteCodeMod(selected.id, seatCap);
      setToast(`Granted ${r.code} with ${r.seat_cap} seats to ${selected.display_name}.`);
      setCodes(await listInviteCodesMod(selected.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Grant failed');
    }
  }

  async function confirmRetire(): Promise<void> {
    if (!pendingRetire || !selected) return;
    try {
      await retireInviteCodeMod(pendingRetire);
      setPendingRetire(null);
      setCodes(await listInviteCodesMod(selected.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retire failed');
    }
  }

  function handleSetQuery(s: string): void {
    queryRef.current = s;
    setQuery(s);
  }

  return {
    query,
    setQuery: handleSetQuery,
    results,
    search,
    selected,
    selectUser,
    codes,
    seatCap,
    setSeatCap,
    grant,
    pendingRetire,
    openRetire: (codeId: string) => setPendingRetire(codeId),
    closeRetire: () => setPendingRetire(null),
    confirmRetire,
    toast,
    error,
  };
}
