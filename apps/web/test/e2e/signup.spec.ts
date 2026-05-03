import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// This test exercises the full signup happy path against a live stack:
//   1. Local API (:3001) with a moderator seeded + a pre-minted invite code
//   2. Local web (:5173) with VITE_AUTH_URL / VITE_AUTH_ANON_KEY pointing
//      at the project's auth instance
//   3. AUTH_ADMIN_KEY available to this test so we can admin-generate the
//      confirmation link without waiting on real email delivery
//
// Preconditions (documented in docs/superpowers/specs/2026-04-20-m10-signup-flow-redesign-design.md):
// - A moderator user exists in the DB and has minted the invite code `de32s`
//   with seat_cap=3, seats_remaining=3, is_active=true.
//
// If AUTH_ADMIN_KEY is not set this test is skipped (the admin API is
// required to generate a confirmation link without real email delivery).

const ADMIN_KEY = process.env.AUTH_ADMIN_KEY;
const AUTH_URL = process.env.AUTH_URL ?? process.env.VITE_AUTH_URL;
const SEED_CODE = process.env.E2E_INVITE_CODE ?? 'de32s';

test.describe('signup happy path', () => {
  test.skip(
    !ADMIN_KEY || !AUTH_URL,
    'E2E signup requires AUTH_ADMIN_KEY + AUTH_URL to bypass email.',
  );

  test('redeems a code and lands on /', async ({ page, baseURL }) => {
    const admin = createClient(AUTH_URL!, ADMIN_KEY!, {
      auth: { persistSession: false },
    });

    await page.goto(`${baseURL}/login`);
    await page.getByRole('link', { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/signup$/);

    await page.getByLabel(/invite code/i).fill(SEED_CODE);
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/invited by/i)).toBeVisible();
    await page.getByRole('button', { name: /continue/i }).click();

    const email = `e2e-${Date.now()}@example.com`;
    const password = 'e2e-pass-1234';
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/^password$/i).fill(password);
    await page.getByLabel(/confirm password/i).fill(password);
    await page.getByRole('button', { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/signup\/check-email/);

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        data: { invite_code: SEED_CODE },
        redirectTo: `${baseURL}/auth/callback`,
      },
    });
    expect(error).toBeNull();
    const confirmationUrl = data?.properties?.action_link;
    expect(confirmationUrl).toBeTruthy();

    await page.goto(confirmationUrl!);
    await expect(page).toHaveURL(new RegExp(`${baseURL}/?$`));
  });
});
