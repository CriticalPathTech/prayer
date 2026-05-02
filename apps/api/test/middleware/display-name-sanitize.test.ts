import { describe, expect, it } from 'vitest';

import { sanitizeDisplayName } from '../../src/middleware/auth.js';

describe('sanitizeDisplayName', () => {
  it('strips HTML-meaningful characters from the email local-part', () => {
    const out = sanitizeDisplayName('<script>alert(1)</script>@x.com');
    expect(out).toBe('scriptalert1script');
  });

  it('truncates to 60 characters', () => {
    const out = sanitizeDisplayName(`${'a'.repeat(500)}@x.com`);
    expect(out.length).toBeLessThanOrEqual(60);
  });

  it('keeps hyphens, apostrophes, periods, and whitespace', () => {
    const out = sanitizeDisplayName("j.o'brien-smith@x.com");
    expect(out).toBe("j.o'brien-smith");
  });

  it('keeps Mandarin characters', () => {
    expect(sanitizeDisplayName('開路者@x.com')).toBe('開路者');
    expect(sanitizeDisplayName('開路者')).toBe('開路者');
  });

  it('keeps Arabic, Devanagari, and accented Latin', () => {
    expect(sanitizeDisplayName('محمد@x.com')).toBe('محمد');
    expect(sanitizeDisplayName('देव@x.com')).toBe('देव');
    expect(sanitizeDisplayName('José Sánchez@x.com')).toBe('José Sánchez');
  });

  it("strips emojis and other symbols (kept narrowly to letters/digits/whitespace/-/./')", () => {
    expect(sanitizeDisplayName('Alice 👋@x.com')).toBe('Alice');
    expect(sanitizeDisplayName('Bob#123@x.com')).toBe('Bob123');
  });
});
