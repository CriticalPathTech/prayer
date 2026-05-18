import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 30_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Files share TEST_DATABASE_URL — disable parallel file execution to
    // prevent cross-file data races (relevant under vitest 4's defaults).
    fileParallelism: false,
  },
});
