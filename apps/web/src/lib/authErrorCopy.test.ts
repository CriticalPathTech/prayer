import { describe, it, expect } from 'vitest';

import { authErrorCopy } from './authErrorCopy';

describe('authErrorCopy', () => {
  it('maps over_email_send_rate_limit to friendly copy with disable60s action', () => {
    const out = authErrorCopy({ code: 'over_email_send_rate_limit' });
    expect(out).toEqual({
      text: 'Too many sign-up attempts for this email. Please wait a few minutes.',
      action: 'disable60s',
    });
  });

  it('maps weak_password', () => {
    const out = authErrorCopy({ code: 'weak_password' });
    expect(out.text).toMatch(/password/i);
  });

  it('maps api-side CODE_FULL', () => {
    const out = authErrorCopy({ code: 'CODE_FULL' });
    expect(out.text).toMatch(/filled up/i);
  });

  it('falls back to generic copy on unknown error', () => {
    const out = authErrorCopy({ code: 'nope_unknown' });
    expect(out.text).toMatch(/please try again/i);
    expect(out.action).toBe('retry');
  });

  it('handles null/undefined safely', () => {
    const out = authErrorCopy(null);
    expect(out.text).toMatch(/please try again/i);
  });

  it('maps invalid_credentials', () => {
    const out = authErrorCopy({ code: 'invalid_credentials' });
    expect(out.text).toMatch(/current password is incorrect/i);
  });

  it('maps same_password', () => {
    const out = authErrorCopy({ code: 'same_password' });
    expect(out.text).toMatch(/must differ/i);
  });

  it('maps PAYLOAD_TOO_LARGE', () => {
    const out = authErrorCopy({ code: 'PAYLOAD_TOO_LARGE' });
    expect(out.text).toMatch(/too large|larger than/i);
  });

  it('maps STORAGE_ERROR', () => {
    const out = authErrorCopy({ code: 'STORAGE_ERROR' });
    expect(out.text).toMatch(/save your photo/i);
  });
});
