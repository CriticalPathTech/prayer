import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Files share TEST_DATABASE_URL — without this, vitest 4's default
    // concurrent file scheduling lets one file's afterEach delete rows
    // mid-flight in another file (~200 tests fail with the default).
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
