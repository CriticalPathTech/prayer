import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const SCREENS: { name: string; path: string; requiresAuth: boolean }[] = [
  { name: 'login', path: '/login', requiresAuth: false },
  { name: 'feed', path: '/', requiresAuth: true },
  { name: 'compose', path: '/compose', requiresAuth: true },
  { name: 'drafts', path: '/me/drafts', requiresAuth: true },
  { name: 'archive', path: '/me/archive', requiresAuth: true },
  { name: 'notifications', path: '/notifications', requiresAuth: true },
];

test.describe('axe: zero critical violations', () => {
  for (const screen of SCREENS) {
    test(`${screen.name}`, async ({ page }) => {
      test.skip(screen.requiresAuth, 'auth fixture not yet wired');
      await page.goto(screen.path);
      await page.waitForLoadState('networkidle');
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const critical = result.violations.filter((v) => v.impact === 'critical');
      if (critical.length > 0) {
        console.log(JSON.stringify(critical, null, 2));
      }
      expect(critical).toHaveLength(0);
    });
  }
});
