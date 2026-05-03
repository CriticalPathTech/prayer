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
});
