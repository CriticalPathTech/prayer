import { describe, expect, it } from 'vitest';

import { generatePassword } from '../src/passwords.js';

describe('generatePassword', () => {
  it('returns a 20-char string by default', () => {
    const pw = generatePassword();
    expect(pw).toHaveLength(20);
    expect(typeof pw).toBe('string');
  });

  it('honors the length argument', () => {
    expect(generatePassword(8)).toHaveLength(8);
    expect(generatePassword(40)).toHaveLength(40);
  });

  it('uses only the unambiguous alphabet (no 0/O/1/l/I)', () => {
    // Generate enough output that any forbidden char would almost certainly appear
    const big = generatePassword(10000);
    expect(big).not.toMatch(/[0O1lI]/);
    // Sanity: only alphanumerics from the allowed set
    expect(big).toMatch(/^[a-zA-Z0-9]+$/);
  });

  it('produces different values on consecutive calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generatePassword());
    expect(seen.size).toBe(50);
  });
});
