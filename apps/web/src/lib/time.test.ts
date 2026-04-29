import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { expiringSoon, formatAgo } from './time';

describe('formatAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-28T16:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows "just now" for events within the last minute', () => {
    expect(formatAgo('2026-04-28T15:59:30Z')).toBe('just now');
  });

  it('shows minutes for events within the last hour', () => {
    expect(formatAgo('2026-04-28T15:55:00Z')).toBe('5m ago');
  });

  it('shows hours for events within the last day', () => {
    expect(formatAgo('2026-04-28T13:00:00Z')).toBe('3h ago');
  });

  it('shows days when older than a day', () => {
    expect(formatAgo('2026-04-26T16:00:00Z')).toBe('2d ago');
  });
});

describe('expiringSoon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-28T16:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when iso is null', () => {
    expect(expiringSoon(null)).toBeNull();
  });

  it('returns null when already expired', () => {
    expect(expiringSoon('2026-04-28T15:00:00Z')).toBeNull();
  });

  it('returns null when more than a week away', () => {
    expect(expiringSoon('2026-05-08T16:00:00Z')).toBeNull();
  });

  it('shows "Expires today" when less than a day remains', () => {
    // 23 hours from now — 0.958 days
    expect(expiringSoon('2026-04-29T15:00:00Z')).toBe('Expires today');
  });

  it('rounds 1.0003 days to "Expires in 1 day" (regression guard)', () => {
    // The bug was Math.ceil rounding 1.0003 → 2. Picker's "1 day" option
    // adds a 30s buffer in buildExpiresAt, producing this exact scenario
    // for a freshly-published post.
    const oneDayPlus30s = new Date('2026-04-29T16:00:30Z').toISOString();
    expect(expiringSoon(oneDayPlus30s)).toBe('Expires in 1 day');
  });

  it('uses singular "day" for the 1-day boundary', () => {
    const justOverOneDay = new Date('2026-04-29T16:30:00Z').toISOString();
    expect(expiringSoon(justOverOneDay)).toBe('Expires in 1 day');
  });

  it('uses plural "days" beyond 1', () => {
    const threeDays = new Date('2026-05-01T16:00:00Z').toISOString();
    expect(expiringSoon(threeDays)).toBe('Expires in 3 days');
  });

  it('rounds 6.6 days to "Expires in 7 days"', () => {
    const sixPointSix = new Date('2026-05-05T06:24:00Z').toISOString();
    expect(expiringSoon(sixPointSix)).toBe('Expires in 7 days');
  });
});
