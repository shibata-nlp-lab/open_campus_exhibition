import { defineConfig } from 'vitest/config';

/**
 * テストはメインプロセス側のコードも読むので root はリポジトリ直下（vite.config.ts は src が root）。
 * DOM を触るテストはまだ無いので environment は node のまま。
 *
 * Vitest は 3 系に固定している。4 系は vite 8（rolldown）を抱き込み、その optional peer
 * dependency である esbuild の扱いが npm のバージョンで変わるため、手元（npm 11）で作った
 * lock ファイルを CI（npm 10）の npm ci が「不足あり」と判断して落ちる。
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
