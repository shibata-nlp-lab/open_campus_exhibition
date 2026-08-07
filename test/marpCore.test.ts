import { describe, expect, it } from 'vitest';
import { isMarpDocument, renderMarp, stripRemoteImports, themeNameOf } from '../src/lib/marp';

describe('isMarpDocument', () => {
  it('marp: true か theme: があるときに true', () => {
    expect(isMarpDocument('---\nmarp: true\n---\n# A')).toBe(true);
    expect(isMarpDocument('---\nmarp: false\n---\n# A')).toBe(false);
    // theme を指定している時点で Marp のつもりで書かれている
    expect(isMarpDocument('---\ntheme: gaia\n---\n# A')).toBe(true);
    expect(isMarpDocument('# A')).toBe(false);
  });

  it('先頭の --- をページ区切りのつもりで書いたものは Marp 扱いしない', () => {
    expect(isMarpDocument('---\n\n<!-- _class: center -->\n\n# おわり\n\n---\n')).toBe(false);
  });

  it('既存の教材（フロントマター無し）は従来どおり扱う', () => {
    expect(isMarpDocument('# みだし\n\n---\n\n# 2ページ目')).toBe(false);
  });
});

describe('themeNameOf', () => {
  it('/* @theme 名前 */ を読む', () => {
    expect(themeNameOf('/* @theme mytheme */\nsection{}')).toBe('mytheme');
    expect(themeNameOf('/*@theme  my-theme  */')).toBe('my-theme');
  });

  it('無ければ null', () => {
    expect(themeNameOf('section{}')).toBeNull();
  });
});

describe('stripRemoteImports', () => {
  it('外部フォントの読み込みを落とす（展示は回線が無い前提）', () => {
    const css = '@charset "UTF-8";@import "https://fonts.bunny.net/css?family=Lato";section{color:red}';
    const out = stripRemoteImports(css);
    expect(out).not.toContain('fonts.bunny.net');
    expect(out).toContain('section{color:red}');
  });

  it('url() 形式も落とす', () => {
    expect(stripRemoteImports('@import url(https://x/y.css);a{}')).not.toContain('https');
  });

  it('ローカルの @import は残す', () => {
    expect(stripRemoteImports('@import "theme.css";a{}')).toContain('theme.css');
  });
});

describe('renderMarp', () => {
  const SRC = `---
marp: true
paginate: true
theme: gaia
style: |
    section.title * , h1{
        text-align: center;
    }
---
<!-- _class: title -->
<!-- このページだけ中央寄せ -->
# ご覧いただきありがとうございました

---

# 2ページ目
`;

  it('ページごとの HTML を返す', async () => {
    const r = await renderMarp(SRC);
    expect(r.slides).toHaveLength(2);
    expect(r.slides[0]).toContain('ご覧いただきありがとうございました');
    expect(r.slides[1]).toContain('2ページ目');
  });

  it('_class がページの section に付く', async () => {
    const r = await renderMarp(SRC);
    expect(r.slides[0]).toContain('class="title"');
    expect(r.slides[1]).not.toContain('class="title"');
  });

  it('テーマ（gaia）の CSS が入る', async () => {
    const r = await renderMarp(SRC);
    expect(r.css).toContain('div.marpit > svg > foreignObject > section');
    expect(r.css.length).toBeGreaterThan(5000);
  });

  it('style: の指定が CSS に入る', async () => {
    const r = await renderMarp(SRC);
    expect(r.css).toContain('text-align:center');
  });

  it('paginate でページ番号の指定が入る', async () => {
    const r = await renderMarp(SRC);
    expect(r.slides[0]).toContain('data-marpit-pagination');
  });

  it('外部フォントの読み込みは残らない', async () => {
    const r = await renderMarp(SRC);
    expect(r.css).not.toContain('http');
  });

  it('自作テーマを登録して使える', async () => {
    const src = '---\nmarp: true\ntheme: mytheme\n---\n# A';
    const r = await renderMarp(src, ['/* @theme mytheme */\nsection { background: #012345; }']);
    expect(r.css).toContain('#012345');
  });

  it('テーマとして読めない CSS があっても他は動く', async () => {
    const src = '---\nmarp: true\ntheme: ok\n---\n# A';
    const r = await renderMarp(src, ['section{}', '/* @theme ok */\nsection { background: #abcdef; }']);
    expect(r.css).toContain('#abcdef');
  });

  it('コメントは本文に出ない', async () => {
    const r = await renderMarp(SRC);
    expect(r.slides[0]).not.toContain('このページだけ中央寄せ');
  });
});
