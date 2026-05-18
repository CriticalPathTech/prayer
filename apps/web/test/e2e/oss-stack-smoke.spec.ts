import { test, expect } from '@playwright/test';

// OSS stack smoke test. Drives a real session against a live local stack
// and verifies the three interactions a member uses every day: reacting,
// updating their own prayer, and commenting on someone else's. Run only
// against a freshly-bootstrapped local stack — never a production target
// (the bootstrap step refuses non-localhost URLs).
//
// Used in two contexts:
//   - feature branches (CI): images are built locally and brought up
//     via the inherited build: blocks in docker-compose.yml. No GHCR
//     publish.
//   - tagged releases (release-tag.yml): images are pulled from GHCR
//     at the just-published version tag.
//
// In both cases the spec is identical — what changes is which images
// are running underneath.
//
// Default seed credentials assume `pnpm bootstrap` (no flags) ran with the
// default org slug ('hope') and the default email domain ('example.com' via
// BOOTSTRAP_EMAIL_DOMAIN). Bootstrap derives user emails from those, so the
// super_user is `<slug>su@<domain>` = `hopesu@example.com`. Override via env
// if running against a non-default seed:
//   E2E_USER_EMAIL, E2E_USER_PASSWORD
//
// State assumption: reactions toggle, so a second run against the same
// stack would un-react and fail the reaction assertion. CI brings up a
// fresh stack per PR. Re-bootstrap locally if you need to re-run.

const EMAIL = process.env.E2E_USER_EMAIL ?? 'hopesu@example.com';
const PASSWORD = process.env.E2E_USER_PASSWORD ?? 'prayer-dev-local';

// Bootstrap-seeded posts we anchor on by body text. Both are stable
// across `pnpm bootstrap` runs. The first is authored by the test user
// (hopesu) so they can post updates to it. The second is authored by a
// different user so the test user can post a top-level comment (authors
// can only reply within existing threads, not start new ones).
const OWN_POST_BODY_PREFIX = '[E2E] Parent prayer';
const OTHER_POST_BODY_PREFIX = 'For our missionaries';

test.describe('OSS stack smoke', () => {
  test('login, react, add update, leave comment — verify each lands', async ({
    page,
    baseURL,
  }, testInfo) => {
    // Include project name in the unique marker so two parallel
    // workers (chromium + webkit) don't collide on Date.now(): if both
    // stamp at the same millisecond, identical body text means one
    // project's getByText assertion can falsely match the other
    // project's row.
    const stamp = `${testInfo.project.name}-${Date.now()}`;

    await page.goto(`${baseURL}/login`);

    // Login form labels aren't htmlFor-bound (the Field component renders
    // them as siblings), so getByLabel doesn't resolve. Type-based
    // selectors are stable.
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(`${baseURL}/`);

    // Smoke gate: at least one feed post rendered. Articles are the
    // stable common ground between mobile and desktop layouts.
    await expect(page.locator('article').first()).toBeVisible();

    const ownCard = page.locator('article').filter({ hasText: OWN_POST_BODY_PREFIX }).first();
    const ownHref = await ownCard.locator('a[href^="/posts/"]').first().getAttribute('href');
    expect(ownHref, 'seeded [E2E] post must be on the feed').toBeTruthy();

    await test.step('emoji reaction on the feed', async () => {
      await ownCard.getByRole('button', { name: 'Add reaction' }).click();
      // The picker is a dialog with aria-label `<reactions-group-label> picker`.
      // Scope to it so we don't collide with any pre-existing in-strip emoji
      // button that shares the same SENTIMENTS[e] aria-label.
      await page
        .getByRole('dialog', { name: /picker$/ })
        .getByRole('button', { name: 'I am praying for this' })
        .click();
      await expect(
        ownCard.getByRole('button', { name: 'Remove reaction: I am praying for this' }),
      ).toBeVisible();
    });

    await test.step('add an update on the user’s own post', async () => {
      await page.goto(`${baseURL}${ownHref}`);
      await page.getByRole('button', { name: 'Add update' }).click();
      const body = `smoke-test update ${stamp}`;
      await page.getByRole('textbox', { name: 'Update body' }).fill(body);
      // Desktop labels the submit "Publish update"; mobile labels it
      // "Save update". One regex matches both.
      await page.getByRole('button', { name: /^(Publish|Save) update$/ }).click();
      await expect(page.getByText(body)).toBeVisible();
    });

    await test.step('leave a top-level comment on someone else’s post', async () => {
      await page.goto(`${baseURL}/`);
      const otherCard = page.locator('article').filter({ hasText: OTHER_POST_BODY_PREFIX }).first();
      const otherHref = await otherCard.locator('a[href^="/posts/"]').first().getAttribute('href');
      expect(otherHref, 'seeded missionaries post must be on the feed').toBeTruthy();
      await page.goto(`${baseURL}${otherHref}`);

      const body = `smoke-test comment ${stamp}`;
      // Desktop CommentForm labels the textarea "Your comment"; the
      // mobile MobileCommentComposer labels it "Reply" (since the mobile
      // pinned composer doubles as both top-level comment and thread
      // reply input).
      await page.getByRole('textbox', { name: /^(Your comment|Reply)$/ }).fill(body);
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByText(body)).toBeVisible();
    });
  });
});
