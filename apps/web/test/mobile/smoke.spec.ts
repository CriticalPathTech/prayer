import { expect, test } from '@playwright/test';

const SCREENS: { name: string; path: string; requiresAuth: boolean }[] = [
  { name: 'login', path: '/login', requiresAuth: false },
  { name: 'feed', path: '/', requiresAuth: true },
  { name: 'compose', path: '/compose', requiresAuth: true },
  { name: 'drafts', path: '/me/drafts', requiresAuth: true },
  { name: 'archive', path: '/me/archive', requiresAuth: true },
  { name: 'notifications', path: '/notifications', requiresAuth: true },
  { name: 'edit', path: '/posts/00000000-0000-0000-0000-000000000000/edit', requiresAuth: true },
];

test.describe('mobile smoke: no horizontal scroll', () => {
  for (const screen of SCREENS) {
    test(`${screen.name}`, async ({ page }) => {
      test.skip(screen.requiresAuth, 'auth fixture not yet wired');
      await page.goto(screen.path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => {
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        };
      });
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
    });
  }
});
