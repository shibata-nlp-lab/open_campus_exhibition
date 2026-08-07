import { describe, expect, it } from 'vitest';
import { parseMarp, resolveRelativeAssets, splitMarkdown } from '../src/lib/markdown';

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

describe('先頭の --- の扱い', () => {
  // `key: value` を含まない `---` ブロックをフロントマターとして食べてしまうと、
  // 次の `---` までが丸ごと消えてスライドが真っ白になる
  it('ページ区切りのつもりの --- で本文が消えない', () => {
    const src = '---\n\n<!-- _class: center -->\n\n# ご覧いただきありがとうございました\n\n---\n';
    const doc = parseMarp(src);
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].markdown).toContain('ご覧いただきありがとうございました');
    expect(doc.pages[0].classes).toEqual(['center']);
  });

  it('本物のフロントマターはこれまでどおり取り除く', () => {
    const doc = parseMarp('---\nmarp: true\npaginate: true\n---\n\n# A\n\n---\n\n# B\n');
    expect(doc.pages.map((p) => p.markdown)).toEqual(['# A', '# B']);
    expect(doc.pages[0].paginate).toBe(true);
  });
});

describe('<style> の取り出し', () => {
  it('scoped はそのページだけ、本文からは消える', () => {
    const src = '# A\n\n<style scoped>\nsection { display: flex; }\n</style>\n\n---\n\n# B\n';
    const doc = parseMarp(src);
    expect(doc.pages[0].markdown).toBe('# A');
    expect(doc.pages[0].style).toBe('section { display: flex; }');
    expect(doc.pages[1].style).toBe('');
    expect(doc.style).toBe('');
  });

  it('scoped でない <style> はスライド全体に効く', () => {
    const doc = parseMarp('# A\n\n---\n\n# B\n\n<style>\nh1 { color: red; }\n</style>\n');
    expect(doc.style).toBe('h1 { color: red; }');
    expect(doc.pages.map((p) => p.markdown)).toEqual(['# A', '# B']);
  });

  it('フロントマターの style: と <style> は両方効く', () => {
    const doc = parseMarp('---\nstyle: |\n  h1 { color: blue; }\n---\n\n# A\n\n<style>\nh2 { color: red; }\n</style>\n');
    expect(doc.style).toBe('h1 { color: blue; }\nh2 { color: red; }');
  });

  it('<style> だけのページは増えないが CSS は拾う', () => {
    const doc = parseMarp('# A\n\n---\n\n<style>\nh1 { color: red; }\n</style>\n');
    expect(doc.pages).toHaveLength(1);
    expect(doc.style).toBe('h1 { color: red; }');
  });
});
