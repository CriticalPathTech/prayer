import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from '../../src/services/cursor.js';

describe('cursor', () => {
  it('round-trips an all-filter cursor', () => {
    const token = encodeCursor({ filter: 'all', id: '018f0000-0000-7000-8000-000000000001' });
    expect(decodeCursor(token, 'all')).toEqual({ id: '018f0000-0000-7000-8000-000000000001' });
  });

  it('round-trips a mine-filter cursor', () => {
    const token = encodeCursor({ filter: 'mine', id: '018f0000-0000-7000-8000-00000000abcd' });
    expect(decodeCursor(token, 'mine')).toEqual({ id: '018f0000-0000-7000-8000-00000000abcd' });
  });

  it('round-trips an answered-filter cursor', () => {
    const token = encodeCursor({ filter: 'answered', id: '018f0000-0000-7000-8000-00000000aaaa' });
    expect(decodeCursor(token, 'answered')).toEqual({
      id: '018f0000-0000-7000-8000-00000000aaaa',
    });
  });

  it('rejects a malformed base64 payload', () => {
    expect(() => decodeCursor('not base64 !!!', 'all')).toThrow(/cursor/i);
  });

  it('rejects a cursor minted for a different filter', () => {
    const token = encodeCursor({ filter: 'all', id: '018f0000-0000-7000-8000-000000000001' });
    expect(() => decodeCursor(token, 'mine')).toThrow(/cursor/i);
  });

  it('rejects a cursor with extra fields', () => {
    const raw = Buffer.from(
      JSON.stringify({ filter: 'all', id: '018f0000-0000-7000-8000-000000000001', rogue: true }),
      'utf8',
    ).toString('base64url');
    expect(() => decodeCursor(raw, 'all')).toThrow(/cursor/i);
  });

  it('rejects a cursor with bad id', () => {
    const raw = Buffer.from(JSON.stringify({ filter: 'all', id: 'not-a-uuid' }), 'utf8').toString(
      'base64url',
    );
    expect(() => decodeCursor(raw, 'all')).toThrow(/cursor/i);
  });
});
