/**
 * macOS 用のワークアラウンド。
 *
 * npm の Electron バイナリはアドホック署名しか持たず、
 *  - iCloud Drive / Box などの File Provider 配下では同期で署名リソースが壊れる
 *  - 古いビルドは Apple 側で notarization が失効し「マルウェアがブロックされました」になる
 * ため、インストール直後にローカルで署名し直す。
 *
 * darwin 以外、または Electron 未インストール時は何もしない。
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appPath = resolve(root, 'node_modules/electron/dist/Electron.app');

if (process.platform !== 'darwin' || !existsSync(appPath)) process.exit(0);

const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: 'pipe' });
    return true;
  } catch (e) {
    console.warn(`[fix-macos-electron] ${cmd} 失敗: ${e.message.split('\n')[0]}`);
    return false;
  }
};

// 署名が既に有効ならそのまま
try {
  execFileSync('codesign', ['--verify', '--deep', appPath], { stdio: 'pipe' });
  process.exit(0);
} catch {
  /* 壊れているので署名し直す */
}

run('xattr', ['-cr', appPath]);
if (run('codesign', ['--force', '--deep', '--sign', '-', appPath])) {
  console.log('[fix-macos-electron] Electron.app をアドホック署名し直しました。');
}
