import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useIsMobile } from './useIsMobile';

type Listener = (e: MediaQueryListEvent) => void;

interface FakeMQL {
  matches: boolean;
  addEventListener: (type: 'change', cb: Listener) => void;
  removeEventListener: (type: 'change', cb: Listener) => void;
}

describe('useIsMobile', () => {
  let listeners: Set<Listener>;
  let matchesRef: { value: boolean };
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    listeners = new Set();
    matchesRef = { value: false };
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation(
      (): FakeMQL => ({
        get matches() {
          return matchesRef.value;
        },
        addEventListener: (_type, cb) => listeners.add(cb),
        removeEventListener: (_type, cb) => listeners.delete(cb),
      }),
    ) as never;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('returns true when matchMedia matches at mount', () => {
    matchesRef.value = true;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when matchMedia does not match at mount', () => {
    matchesRef.value = false;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('updates when matchMedia fires a change event', () => {
    matchesRef.value = false;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => {
      matchesRef.value = true;
      listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent));
    });
    expect(result.current).toBe(true);
  });

  it('removes the listener on unmount', () => {
    const { unmount } = renderHook(() => useIsMobile());
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
