import { describe, expect, it } from 'vitest';
import { formatIndexList, formatSecList, parseIndexList, parseSecList } from '../src/lib/numberList';

describe('parseIndexList', () => {
  it('画面の 1 番目を 0 として読む', () => {
    expect(parseIndexList('1, 3, 5')).toEqual([0, 2, 4]);
  });

  it('区切りは何でもよい（読点・空白・全角）', () => {
    expect(parseIndexList('1 3 5')).toEqual([0, 2, 4]);
    expect(parseIndexList('1、3、5')).toEqual([0, 2, 4]);
    expect(parseIndexList('1/3/5')).toEqual([0, 2, 4]);
  });

  it('打ちかけの文字列でも、そこまでの数字を拾う', () => {
    // ここが壊れていると、入力欄で2つ目以降を打てなくなる
    expect(parseIndexList('1,')).toEqual([0]);
    expect(parseIndexList('1, ')).toEqual([0]);
    expect(parseIndexList('1, 3,')).toEqual([0, 2]);
  });

  it('0 や負の数は捨てる（1 番目から数えるので 0 番目は無い）', () => {
    expect(parseIndexList('0, 1')).toEqual([0]);
    expect(parseIndexList('-2, 3')).toEqual([1, 2]); // マイナス記号は区切り扱い
  });

  it('空文字なら空', () => {
    expect(parseIndexList('')).toEqual([]);
    expect(parseIndexList('   ')).toEqual([]);
  });

  it('重複や順不同はそのまま残す（見せたい順に並べられるように）', () => {
    expect(parseIndexList('5, 1, 5')).toEqual([4, 0, 4]);
  });
});

describe('formatIndexList', () => {
  it('0 起点を 1 番目からの表示に戻す', () => {
    expect(formatIndexList([0, 2, 4])).toBe('1, 3, 5');
  });

  it('空なら空文字', () => {
    expect(formatIndexList([])).toBe('');
  });

  it('往復しても変わらない', () => {
    for (const text of ['1, 3, 5', '2', '10, 1']) {
      expect(formatIndexList(parseIndexList(text))).toBe(text);
    }
  });
});

describe('parseSecList — 単語ごとの見せる時間', () => {
  it('位置と違ってずらさない', () => {
    expect(parseSecList('3, 5, 2')).toEqual([3, 5, 2]);
  });

  it('0 を残す（待たずに次の単語へ移る指定）', () => {
    expect(parseSecList('0, 3')).toEqual([0, 3]);
  });

  it('小数を受け付ける', () => {
    expect(parseSecList('1.5, 2.25')).toEqual([1.5, 2.25]);
  });

  it('打ちかけでもそこまでを拾う', () => {
    expect(parseSecList('3,')).toEqual([3]);
    expect(parseSecList('3, ')).toEqual([3]);
  });

  it('空なら空', () => {
    expect(parseSecList('')).toEqual([]);
    expect(parseSecList('.')).toEqual([]);
  });

  it('往復しても変わらない', () => {
    for (const text of ['3, 5, 2', '0', '1.5']) {
      expect(formatSecList(parseSecList(text))).toBe(text);
    }
  });
});
