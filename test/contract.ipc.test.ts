import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * IPC のチャネル名は preload と main に文字列で二重に書かれており、型では守られない。
 * typo すると実行時に静かに失敗する（呼んでも誰も応答しない）ので、ここで突き合わせる。
 */
const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');
const preload = read('electron/preload.ts');
const main = read('electron/main.ts');

const collect = (src: string, re: RegExp) => {
  const out = new Set<string>();
  for (const m of src.matchAll(re)) out.add(m[1]);
  return out;
};

const invoked = collect(preload, /ipcRenderer\.invoke\(\s*'([^']+)'/g);
const sent = collect(preload, /ipcRenderer\.send\(\s*'([^']+)'/g);
const listened = collect(preload, /ipcRenderer\.(?:on|off)\(\s*'([^']+)'/g);

const handled = collect(main, /ipcMain\.handle\(\s*'([^']+)'/g);
const received = collect(main, /ipcMain\.on\(\s*'([^']+)'/g);
const pushed = collect(main, /webContents\.send\(\s*'([^']+)'/g);

describe('IPC チャネルの対応', () => {
  it('抽出そのものが機能している（正規表現が空振りしていない）', () => {
    expect(invoked.size).toBeGreaterThan(20);
    expect(handled.size).toBeGreaterThan(20);
    expect(sent.size).toBeGreaterThan(0);
    expect(listened.size).toBeGreaterThan(0);
    expect(pushed.size).toBeGreaterThan(0);
  });

  it('preload が invoke するチャネルは main に handle がある', () => {
    const missing = [...invoked].filter((ch) => !handled.has(ch));
    expect(missing, `main に ipcMain.handle が無い: ${missing.join(', ')}`).toEqual([]);
  });

  it('preload が send するチャネルは main に on がある', () => {
    const missing = [...sent].filter((ch) => !received.has(ch));
    expect(missing, `main に ipcMain.on が無い: ${missing.join(', ')}`).toEqual([]);
  });

  it('preload が待ち受けるチャネルは main から送られている', () => {
    // main→renderer の push。送り手が居ないと画面が永久に更新されない
    const missing = [...listened].filter((ch) => !pushed.has(ch));
    expect(missing, `main に webContents.send が無い: ${missing.join(', ')}`).toEqual([]);
  });

  it('main の handle / on に、preload から呼ばれないものが無い（消し忘れ検出）', () => {
    const unused = [...handled, ...received].filter((ch) => !invoked.has(ch) && !sent.has(ch));
    expect(unused, `preload から呼ばれていない: ${unused.join(', ')}`).toEqual([]);
  });

  it('on と off が対で書かれている（購読解除の書き忘れ検出）', () => {
    const on = collect(preload, /ipcRenderer\.on\(\s*'([^']+)'/g);
    const off = collect(preload, /ipcRenderer\.off\(\s*'([^']+)'/g);
    expect([...on].filter((ch) => !off.has(ch))).toEqual([]);
  });
});

describe('レンダラの外部窓口', () => {
  it('レンダラが ipcRenderer を直接使っていない（窓口は window.api だけ）', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && /ipcRenderer|require\(['"]electron/.test(fs.readFileSync(p, 'utf-8'))) {
          offenders.push(p);
        }
      }
    };
    walk(path.resolve(__dirname, '../src'));
    expect(offenders).toEqual([]);
  });
});
