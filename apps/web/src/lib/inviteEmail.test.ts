import { describe, expect, it } from 'vitest';

import { buildInviteEmail } from './inviteEmail';
import { churchName } from './org';

describe('churchName', () => {
  it('appends Church when the name does not already end with it', () => {
    expect(churchName('Lakeside')).toBe('Lakeside Church');
  });

  it('leaves a name that already ends with Church alone', () => {
    expect(churchName('Lakeside Church')).toBe('Lakeside Church');
  });

  it('matches the existing suffix case-insensitively and preserves the original casing', () => {
    expect(churchName('lakeside church')).toBe('lakeside church');
    expect(churchName('Lakeside CHURCH')).toBe('Lakeside CHURCH');
  });

  it('trims surrounding whitespace', () => {
    expect(churchName('  Lakeside  ')).toBe('Lakeside Church');
  });

  it('does not match "church" inside a longer trailing word', () => {
    expect(churchName('Christchurch')).toBe('Christchurch Church');
  });

  it('returns null for a missing or blank name', () => {
    expect(churchName(null)).toBeNull();
    expect(churchName(undefined)).toBeNull();
    expect(churchName('   ')).toBeNull();
  });
});

describe('buildInviteEmail', () => {
  const base = {
    church: 'Lakeside Church',
    code: '7QK2-M4PD',
    signupUrl: 'https://lakeside.prays.online/signup',
    seatsRemaining: 1,
  };

  it('includes the church name, code and signup link in the body', () => {
    const { body } = buildInviteEmail(base);
    expect(body).toContain('Lakeside Church');
    expect(body).toContain('7QK2-M4PD');
    expect(body).toContain('https://lakeside.prays.online/signup');
  });

  it('tells a single-seat inviter not to pass the code on', () => {
    expect(buildInviteEmail({ ...base, seatsRemaining: 1 }).body).toContain(
      "The code is just for you, so please don't pass it on.",
    );
  });

  it('asks a multi-seat inviter to keep the code within the church', () => {
    const { body } = buildInviteEmail({ ...base, seatsRemaining: 3 });
    expect(body).toContain('Please keep this code within our church family.');
    expect(body).not.toContain('just for you');
  });

  it('falls back to generic wording when the church has no name', () => {
    const { body } = buildInviteEmail({ ...base, church: null });
    expect(body).toContain('join our prayer wall');
    expect(body).not.toContain('null');
    expect(body).not.toContain(' at .');
  });
});
