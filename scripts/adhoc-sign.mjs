/**
 * electron-builder の afterPack フック（macOS 専用）。
 *
 * Apple Developer ID を持たないので配布物には正式な署名を付けられないが、
 * Apple Silicon の macOS は「署名がまったく無い」アプリを起動できない。
 * そこでパッケージ直後にアドホック署名（identity = "-"）を付ける。
 *
 * これで起動はできるようになるが公証（notarization）はされないため、
 * 受け取った人は初回だけ「右クリック → 開く」または `xattr -cr` が必要。
 * darwin 以外では何もしない。
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'pipe' });
    execFileSync('codesign', ['--verify', '--deep', appPath], { stdio: 'pipe' });
    console.log(`  • ad-hoc signed  ${appName}`);
  } catch (e) {
    // 署名できなくてもビルド自体は続行する（受け取り側で xattr -cr すれば起動できる）
    console.warn(`  • ad-hoc sign failed: ${String(e.message).split('\n')[0]}`);
  }
}
