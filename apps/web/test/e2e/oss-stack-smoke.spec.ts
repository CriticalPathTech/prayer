import { test, expect } from '@playwright/test';

// OSS stack smoke test. Drives a real session against a live local stack
// and verifies the four interactions a member uses every day: creating a
// post, reacting, posting an update on their own post, and commenting on
// someone else's. Run only against a freshly-bootstrapped local stack —
// never a production target (the bootstrap step refuses non-localhost URLs).
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
// Seed assumption: the default `pnpm bootstrap` seeds 10 posts authored by
// the four non-super-user accounts and **zero posts authored by the super
// user**. So the test creates its own post to update (rather than anchoring
// on a pre-seeded post for the update step). It does anchor on one stable
// seed body — "For our missionaries in East Asia" — for the comment step,
// since hopesu can't post a top-level comment on their own post.
//
// Cross-view divergences this spec navigates around:
//   - Compose submit button: "Share" (desktop) vs "Publish" (mobile)
//   - Compose post-publish navigation: /posts/:id (desktop) vs / (mobile)
//   - Update submit button: "Publish update" (desktop) vs "Save update" (mobile)
//   - Comment textarea aria-label: "Your comment" (desktop) vs "Reply" (mobile)
//   - Feed list wrapping: <ul><li><article> (desktop) vs flat <article> (mobile)
// Anchoring by body text via .filter({hasText:...}) sidesteps the structural
// divergences. Inline-update <article> elements are descendants of the parent
// post's <article>; the parent's textContent transitively includes them, so
// `filter({hasText: postBody}).first()` matches the parent reliably (the
// inline-update articles' own textContent doesn't include the parent body).

const EMAIL = process.env.E2E_USER_EMAIL ?? 'hopesu@example.com';
const PASSWORD = process.env.E2E_USER_PASSWORD ?? 'prayer-dev-local';

test.describe('OSS stack smoke', () => {
  test('login, post, react, add update, leave comment — verify each lands', async ({
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

    const postBody = `smoke-test post ${stamp}`;
    await test.step('publish a new post via compose', async () => {
      await page.goto(`${baseURL}/compose`);
      await page.getByRole('textbox', { name: 'Body' }).fill(postBody);
      // Desktop submit is "Share"; mobile is "Publish".
      await page.getByRole('button', { name: /^(Share|Publish)$/ }).click();
      // The click() promise resolves on dispatch, not when onShare's
      // async chain (flush → publishMyDraft → navigate) finishes. If
      // we navigate away too early, publishMyDraft is aborted mid-flight
      // and the post never reaches `published`. Wait for the app's own
      // post-publish navigation away from /compose first.
      await page.waitForURL((url) => !url.pathname.endsWith('/compose'));
      // Desktop lands on /posts/:id; mobile lands on /. Normalize to
      // the feed so the next step can locate the post by body text.
      await page.goto(`${baseURL}/`);
      await expect(page.locator('article').filter({ hasText: postBody }).first()).toBeVisible();
    });

    await test.step('add an update on the post we just published', async () => {
      const ourCard = page.locator('article').filter({ hasText: postBody }).first();
      const ourHref = await ourCard.locator('a[href^="/posts/"]').first().getAttribute('href');
      expect(ourHref, 'our just-published post must be on the feed').toBeTruthy();
      await page.goto(`${baseURL}${ourHref}`);

      await page.getByRole('button', { name: 'Add update' }).click();
      const body = `smoke-test update ${stamp}`;
      await page.getByRole('textbox', { name: 'Update body' }).fill(body);
      // Desktop submit is "Publish update"; mobile is "Save update".
      await page.getByRole('button', { name: /^(Publish|Save) update$/ }).click();
      await expect(page.getByText(body)).toBeVisible();
    });

    await test.step('emoji reaction on our own post in the feed', async () => {
      await page.goto(`${baseURL}/`);
      // Reacting on your own post is allowed and exercises the same
      // Reactions component the user hits on any feed card.
      const ourCard = page.locator('article').filter({ hasText: postBody }).first();
      await ourCard.getByRole('button', { name: 'Add reaction' }).click();
      // The picker is a dialog with aria-label `<reactions-group-label> picker`.
      // Scope to it so we don't collide with any in-strip emoji button
      // that may share the same SENTIMENTS[e] aria-label.
      await page
        .getByRole('dialog', { name: /picker$/ })
        .getByRole('button', { name: 'I am praying for this' })
        .click();
      await expect(
        ourCard.getByRole('button', { name: 'Remove reaction: I am praying for this' }),
      ).toBeVisible();
    });

    await test.step('leave a top-level comment on someone else’s post', async () => {
      // Anchor on a stable bootstrap-seeded post body authored by
      // mod1, so the test user (hopesu) is a non-author and the
      // top-level CommentForm renders. (Authors only get reply
      // inputs inside existing threads.)
      const otherCard = page.locator('article').filter({ hasText: 'For our missionaries' }).first();
      const otherHref = await otherCard.locator('a[href^="/posts/"]').first().getAttribute('href');
      expect(otherHref, 'seeded mod1 post must be on the feed').toBeTruthy();
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
