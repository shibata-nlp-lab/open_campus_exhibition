/**
 * macOS 用のワークアラウンド。
 *
 * npm の Electron バイナリはアドホック署名しか持たず、
 *  - iCloud Drive / Box などの File Provider 配下では同期で署名リソースが壊れる
 *  - 古いビルドは Apple 側で notarization が失効し「マルウェアがブロックされました」になる
 * ため、インストール直後にローカルで署名し直す。
 *
 * あわせて、ネイティブモジュール（sharp）の CPU 種別が Electron と噛み合っているかも見る。
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

/**
 * Electron の CPU 種別（arm64 / x64）を調べる。
 * Apple Silicon でも Rosetta の node で npm install すると、npm は node 側（x64）に合わせて
 * ネイティブモジュールを入れてしまう。Electron は arm64 なので読み込みに失敗し、
 * sharp なら「Cannot read properties of undefined (reading 'output')」で落ちる。
 */
function electronArch() {
  try {
    const out = execFileSync('file', [resolve(appPath, 'Contents/MacOS/Electron')], { encoding: 'utf-8' });
    if (out.includes('arm64')) return 'arm64';
    if (out.includes('x86_64')) return 'x64';
  } catch {
    /* 分からなければ確認しない */
  }
  return null;
}

/** ネイティブモジュールが Electron と同じ CPU 種別で入っているか確かめ、違えば直し方を出す */
function checkNativeArch() {
  const arch = electronArch();
  if (!arch) return;
  // sharp は @huggingface/transformers が読み込む。入れ子の複製もあるので両方見る
  const dirs = ['node_modules/@img', 'node_modules/@huggingface/transformers/node_modules/@img'];
  const broken = dirs.filter((d) => existsSync(resolve(root, d)) && !existsSync(resolve(root, d, `sharp-darwin-${arch}`)));
  if (broken.length === 0) return;

  console.warn(
    [
      '',
      '[fix-macos-electron] ネイティブモジュールの CPU 種別が Electron と違います。',
      `  Electron: ${arch} / いま入っている sharp: ${arch === 'arm64' ? 'x64' : 'arm64'} 向け`,
      `  （node が ${process.arch} なので、npm がそちらに合わせて入れています）`,
      '  このままだと体験①②のローカルモデルで',
      "  「Cannot read properties of undefined (reading 'output')」で落ちます。",
      '  次を実行してください:',
      '',
      `    npm install --include=optional --os=darwin --cpu=${arch}`,
      '',
    ].join('\n')
  );
}

checkNativeArch();

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
