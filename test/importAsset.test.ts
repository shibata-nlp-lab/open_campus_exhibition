import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// config.ts は app.getPath('userData') を使うので、一時ディレクトリに差し替える
const tmp = path.join(os.tmpdir(), 'oc-asset-' + Math.random().toString(36).slice(2));
vi.mock('electron', () => ({ app: { getPath: () => tmp } }));

const { importAsset, assetAbsolutePath } = await import('../electron/config');

/** 取り込み元のファイルを作る。name は macOS と同じ NFD で置く */
function source(name: string): string {
  const dir = path.join(tmp, 'src');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name.normalize('NFD'));
  fs.writeFileSync(p, 'x');
  return p;
}

beforeAll(() => {
  fs.mkdirSync(tmp, { recursive: true });
});

describe('importAsset', () => {
  it('濁点・半濁点が分かれていても名前が崩れない', () => {
    // macOS から来る「プレゼンテーション1.pdf」は フ+゜ レ セ+゛ … という並びで渡ってくる
    const rel = importAsset(source('プレゼンテーション1.pdf'));
    expect(rel).toMatch(/_プレゼンテーション1\.pdf$/);
    expect(fs.existsSync(assetAbsolutePath(rel))).toBe(true);
  });

  it('長音符を残す', () => {
    expect(importAsset(source('データ.csv'))).toMatch(/_データ\.csv$/);
  });

  it('config に入れた名前と実際に置いたファイル名が一致する', () => {
    const rel = importAsset(source('明日の翼.mp3'));
    expect(fs.readdirSync(path.join(tmp, 'assets'))).toContain(rel);
  });

  it('パスに使えない文字は _ に落とす', () => {
    const rel = importAsset(source('資料 (最終)/版.pdf'.replace('/', '-')));
    expect(path.basename(rel)).not.toMatch(/[ ()]/);
    expect(rel).toMatch(/\.pdf$/);
  });

  it('先頭に時刻が付くので、同じ名前でも上書きしない', () => {
    const a = importAsset(source('同名.pdf'));
    expect(a).toMatch(/^[0-9a-z]+_同名\.pdf$/);
  });
});
