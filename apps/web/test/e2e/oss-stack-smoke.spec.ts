import { test, expect } from '@playwright/test';

// OSS stack smoke test. Deliberately minimal: confirms login works and
// the post-login feed page renders without crashing. Run against a
// freshly-bootstrapped local Docker stack — never a production target
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
// default migration org slug ('hope'). Bootstrap derives user emails from the
// slug, so the super_user is `<slug>su@prays.online` = `hopesu@prays.online`.
// Override via env if running against a non-default seed:
//   E2E_USER_EMAIL, E2E_USER_PASSWORD

const EMAIL = process.env.E2E_USER_EMAIL ?? 'hopesu@prays.online';
const PASSWORD = process.env.E2E_USER_PASSWORD ?? 'prayer-dev-local';

test.describe('OSS stack smoke', () => {
  test('login lands on the feed and the page renders', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/login`);

    // Login form labels aren't htmlFor-bound (the Field component renders
    // them as siblings), so getByLabel doesn't resolve. Type-based
    // selectors are stable.
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Login redirects to / on success. Wait explicitly so we don't race
    // the post-redirect render.
    await page.waitForURL(`${baseURL}/`);

    // Assert at least one bootstrap-seeded post is visible. This is the
    // single "we got past auth, the feed query returned data, React
    // rendered something" check. We assert on the <article> rather than
    // any chrome (heading, layout wrapper) because the mobile and
    // desktop views differ in those — articles are the stable common
    // ground. The Chromium-based iPhone SE emulation renders the
    // desktop layout for that viewport while WebKit's iPhone 12 Pro
    // renders mobile, so any chrome assertion fails on one of them.
    await expect(page.locator('article').first()).toBeVisible();
  });
});
