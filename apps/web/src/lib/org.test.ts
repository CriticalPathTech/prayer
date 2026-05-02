import { describe, expect, it } from 'vitest';

import { displayedOrgName } from './org';

describe('displayedOrgName', () => {
  it('returns empty for null/undefined/empty', () => {
    expect(displayedOrgName(null)).toBe('');
    expect(displayedOrgName(undefined)).toBe('');
    expect(displayedOrgName('')).toBe('');
    expect(displayedOrgName('   ')).toBe('');
  });

  it('returns the full name when under the threshold', () => {
    expect(displayedOrgName('Hope')).toBe('Hope');
    expect(displayedOrgName('Lakeside Church')).toBe('Lakeside Church'); // 15 chars
  });

  it('collapses a long multi-word name to the first word', () => {
    expect(displayedOrgName('Hope Community Church')).toBe('Hope'); // 21 chars
    expect(displayedOrgName('Trinity Reformed Presbyterian')).toBe('Trinity');
  });

  it('returns the full string when a long name has no whitespace', () => {
    expect(displayedOrgName('aaaaaaaaaaaaaaaaaaaaaaaaa')).toBe('aaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('respects a custom maxLen', () => {
    expect(displayedOrgName('Lakeside Church', 10)).toBe('Lakeside');
    expect(displayedOrgName('Hope', 10)).toBe('Hope');
  });

  it('trims surrounding whitespace before evaluating length', () => {
    expect(displayedOrgName('  Hope  ')).toBe('Hope');
  });
});
