import { describe, expect, it } from 'vitest';
import { resolveRelativeAssets, splitMarkdown } from '../src/lib/markdown';

describe('splitMarkdown', () => {
  it('--- でページに分ける', () => {
    expect(splitMarkdown('# 1ページ目\n\n---\n\n# 2ページ目')).toEqual(['# 1ページ目', '# 2ページ目']);
  });

  it('Marp のフロントマターを落とす', () => {
    const src = ['---', 'marp: true', 'theme: default', '---', '', '# 本文'].join('\n');
    expect(splitMarkdown(src)).toEqual(['# 本文']);
  });

  it('フロントマターを落としたあとの --- はページ区切りとして残る', () => {
    const src = ['---', 'marp: true', '---', '', '# 1', '', '---', '', '# 2'].join('\n');
    expect(splitMarkdown(src)).toEqual(['# 1', '# 2']);
  });

  it('Marp のコメントディレクティブを落とす', () => {
    const src = '<!-- _class: lead -->\n# 見出し';
    expect(splitMarkdown(src)).toEqual(['# 見出し']);
  });

  it('区切りが無ければ 1 ページとして返す', () => {
    expect(splitMarkdown('# ひとつだけ')).toEqual(['# ひとつだけ']);
  });

  it('空文字でも空配列にはならない（0ページで落ちないため）', () => {
    expect(splitMarkdown('')).toHaveLength(1);
  });

  it('CRLF のフロントマターも落とせる', () => {
    expect(splitMarkdown('---\r\nmarp: true\r\n---\r\n# 本文')).toEqual(['# 本文']);
  });
});

describe('resolveRelativeAssets', () => {
  const toUrl = (abs: string) => `ocfile://local/${encodeURIComponent(abs)}`;

  it('相対パスを baseDir 基準の絶対パスに直して変換する', () => {
    const html = '<img src="img/cat.png">';
    expect(resolveRelativeAssets(html, '/Users/me/slides', toUrl)).toBe(
      `<img src="${toUrl('/Users/me/slides/img/cat.png')}">`
    );
  });

  it('baseDir の末尾スラッシュの有無で結果が変わらない', () => {
    const html = '<img src="a.png">';
    expect(resolveRelativeAssets(html, '/base', toUrl)).toBe(resolveRelativeAssets(html, '/base/', toUrl));
  });

  it('絶対 URL・アンカー・プロトコル相対はそのまま', () => {
    const html = '<a href="https://example.com/x"><img src="//cdn/x.png"></a><a href="#sec">節</a>';
    expect(resolveRelativeAssets(html, '/base', toUrl)).toBe(html);
  });

  it('baseDir が無ければ何もしない（アプリ内編集のスライド）', () => {
    const html = '<img src="img/cat.png">';
    expect(resolveRelativeAssets(html, null, toUrl)).toBe(html);
  });

  it('日本語のファイル名でも壊れない', () => {
    const html = '<img src="画像/猫.png">';
    expect(resolveRelativeAssets(html, '/base', toUrl)).toBe(`<img src="${toUrl('/base/画像/猫.png')}">`);
  });
});
