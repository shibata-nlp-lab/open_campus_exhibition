import { describe, expect, it } from 'vitest';
import { parseMarp, splitMarkdown } from '../src/lib/markdown';

/** 実際に使われている書き方（ご指摘のあったもの） */
const REAL = `---
marp: true
paginate: true
theme: default
style: |
    section.title * , h1{
        text-align: center;
    }
---
<!-- _class: title -->
<!-- このページだけ中央寄せ -->
# ご覧いただきありがとうございました
---
`;

describe('実際の Marp ファイル', () => {
  const doc = parseMarp(REAL);

  it('本文だけが1ページとして残る', () => {
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].markdown).toBe('# ご覧いただきありがとうございました');
  });

  it('style: の中身を取り出す（インデントは外す）', () => {
    expect(doc.style).toContain('section.title * , h1{');
    expect(doc.style).toContain('text-align: center;');
    expect(doc.style.startsWith('section.title')).toBe(true);
  });

  it('_class: title がページのクラスになる（section.title が効くように）', () => {
    expect(doc.pages[0].classes).toEqual(['title']);
  });

  it('paginate: true が効く', () => {
    expect(doc.pages[0].paginate).toBe(true);
  });

  it('ディレクティブでないコメントは本文から消える', () => {
    expect(doc.pages[0].markdown).not.toContain('このページだけ中央寄せ');
    expect(doc.pages[0].markdown).not.toContain('<!--');
  });
});

describe('フロントマター', () => {
  it('無い場合はそのまま本文になる', () => {
    const doc = parseMarp('# みだし\n\n本文');
    expect(doc.style).toBe('');
    expect(doc.pages[0].markdown).toBe('# みだし\n\n本文');
  });

  it('閉じていないフロントマターは本文として扱う（切り捨てない）', () => {
    const doc = parseMarp('---\nmarp: true\n# みだし');
    expect(doc.pages[0].markdown).toContain('# みだし');
  });

  it('class: と color: も読む', () => {
    const doc = parseMarp('---\nclass: lead\ncolor: "#fff"\n---\n# あ');
    expect(doc.pages[0].classes).toEqual(['lead']);
    expect(doc.pages[0].color).toBe('#fff');
  });

  it('CRLF でも読める', () => {
    const doc = parseMarp('---\r\npaginate: true\r\n---\r\n# あ');
    expect(doc.pages[0].paginate).toBe(true);
    expect(doc.pages[0].markdown).toBe('# あ');
  });
});

describe('ディレクティブの範囲', () => {
  it('_ 付きはそのページだけ', () => {
    const doc = parseMarp('<!-- _class: a -->\n# 1\n\n---\n\n# 2');
    expect(doc.pages[0].classes).toEqual(['a']);
    expect(doc.pages[1].classes).toEqual([]);
  });

  it('_ 無しは以降のページにも効く', () => {
    const doc = parseMarp('<!-- class: a -->\n# 1\n\n---\n\n# 2');
    expect(doc.pages[0].classes).toEqual(['a']);
    expect(doc.pages[1].classes).toEqual(['a']);
  });

  it('あとのページで上書きできる', () => {
    const doc = parseMarp('<!-- class: a -->\n# 1\n\n---\n\n<!-- _class: b -->\n# 2\n\n---\n\n# 3');
    expect(doc.pages.map((p) => p.classes)).toEqual([['a'], ['b'], ['a']]);
  });

  it('1つのコメントに複数書ける', () => {
    const doc = parseMarp('<!--\n_class: a\n_paginate: true\n-->\n# 1');
    expect(doc.pages[0].classes).toEqual(['a']);
    expect(doc.pages[0].paginate).toBe(true);
  });

  it('当てられない theme: は黙って無視する', () => {
    const doc = parseMarp('<!-- theme: gaia -->\n# 1');
    expect(doc.pages[0].markdown).toBe('# 1');
  });
});

describe('ページ分割', () => {
  it('コードブロックの中の --- では割らない', () => {
    const doc = parseMarp('# 1\n\n```\nfoo\n---\nbar\n```\n\n---\n\n# 2');
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[0].markdown).toContain('---');
  });

  it('末尾の --- で空ページを作らない', () => {
    expect(parseMarp('# 1\n\n---\n').pages).toHaveLength(1);
  });

  it('空でも1ページ返す（0ページで落ちないため）', () => {
    expect(parseMarp('').pages).toHaveLength(1);
  });
});

describe('splitMarkdown（本文だけ欲しいとき）', () => {
  it('parseMarp と同じ結果を返す', () => {
    expect(splitMarkdown(REAL)).toEqual(['# ご覧いただきありがとうございました']);
  });
});
