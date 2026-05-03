import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: ['mobile/**/*.spec.ts', 'e2e/**/*.spec.ts'],
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'iPhone SE', use: { ...devices['iPhone SE (2nd generation)'] } },
    { name: 'iPhone 12 Pro', use: { ...devices['iPhone 12 Pro'] } },
  ],
});
