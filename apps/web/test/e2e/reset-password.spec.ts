import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const ADMIN_KEY = process.env.AUTH_ADMIN_KEY;
const AUTH_URL = process.env.AUTH_URL ?? process.env.VITE_AUTH_URL;
const TEST_EMAIL = process.env.E2E_RESET_EMAIL ?? 'e2e-reset@example.com';

test.describe('password reset happy path', () => {
  test.skip(!ADMIN_KEY || !AUTH_URL, 'Reset E2E requires AUTH_ADMIN_KEY + AUTH_URL.');

  test('forgot-password → email link → set new password → signed in', async ({ page, baseURL }) => {
    const admin = createClient(AUTH_URL!, ADMIN_KEY!, {
      auth: { persistSession: false },
    });

    // Preconditions (set up outside the test, documented in comment):
    // 1. A user with TEST_EMAIL + TEST_OLD_PASSWORD exists in auth.users AND our users table.

    await page.goto(`${baseURL}/login`);
    await page.getByRole('link', { name: /forgot your password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);

    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByRole('button', { name: /send reset link/i }).click();
    await expect(page.getByText(/we sent an email to/i)).toBeVisible();

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: TEST_EMAIL,
      options: { redirectTo: `${baseURL}/auth/reset-password` },
    });
    expect(error).toBeNull();
    const link = data?.properties?.action_link;
    expect(link).toBeTruthy();

    await page.goto(link!);
    await expect(page).toHaveURL(/\/auth\/reset-password/);

    const newPassword = `e2e-pw-new-${Date.now()}`;
    await page.getByLabel(/^new password$/i).fill(newPassword);
    await page.getByLabel(/confirm new password/i).fill(newPassword);
    await page.getByRole('button', { name: /update password/i }).click();

    await expect(page).toHaveURL(new RegExp(`${baseURL}/?$`));
  });
});
