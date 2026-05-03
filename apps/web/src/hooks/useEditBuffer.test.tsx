import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useEditBuffer } from './useEditBuffer';

const KEY = 'post_edit_buffer:p1';

describe('useEditBuffer', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('starts with null buffer when no localStorage entry exists', () => {
    const { result } = renderHook(() => useEditBuffer('p1'));
    expect(result.current.buffer).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
  });

  it('hydrates from localStorage on mount', () => {
    localStorage.setItem(KEY, JSON.stringify({ body: 'hello', expires_at: null, savedAt: 42 }));
    const { result } = renderHook(() => useEditBuffer('p1'));
    expect(result.current.buffer).toEqual({
      body: 'hello',
      expires_at: null,
      savedAt: 42,
    });
    expect(result.current.lastSavedAt).toBe(42);
  });

  it('merges set() updates into the stored buffer and updates lastSavedAt', () => {
    const { result } = renderHook(() => useEditBuffer('p1'));
    act(() => result.current.set({ body: 'draft 1' }));
    expect(result.current.buffer?.body).toBe('draft 1');
    expect(result.current.lastSavedAt).not.toBeNull();

    act(() => result.current.set({ expires_at: '2027-01-01T00:00:00.000Z' }));
    expect(result.current.buffer?.body).toBe('draft 1');
    expect(result.current.buffer?.expires_at).toBe('2027-01-01T00:00:00.000Z');

    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    expect(stored?.body).toBe('draft 1');
    expect(stored?.expires_at).toBe('2027-01-01T00:00:00.000Z');
  });

  it('clear() removes the localStorage entry and resets state', () => {
    localStorage.setItem(KEY, JSON.stringify({ body: 'x', savedAt: 1 }));
    const { result } = renderHook(() => useEditBuffer('p1'));
    act(() => result.current.clear());
    expect(result.current.buffer).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('tolerates corrupt JSON by ignoring and clearing the bad entry', () => {
    localStorage.setItem(KEY, '{not json');
    const { result } = renderHook(() => useEditBuffer('p1'));
    expect(result.current.buffer).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keys separately per post id', () => {
    const { result: r1 } = renderHook(() => useEditBuffer('p1'));
    const { result: r2 } = renderHook(() => useEditBuffer('p2'));
    act(() => r1.current.set({ body: 'only p1' }));
    expect(r2.current.buffer).toBeNull();
  });
});
