import { defineConfig } from 'vitest/config';

/**
 * テストはメインプロセス側のコードも読むので root はリポジトリ直下（vite.config.ts は src が root）。
 * DOM を触るテストはまだ無いので environment は node のまま。
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
