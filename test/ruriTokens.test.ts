import { describe, expect, it } from 'vitest';
import { toDisplayTokens } from '../electron/ruriTokens';

const texts = (pieces: string[], ids: number[]) => toDisplayTokens(pieces, ids).map((t) => t.text);

describe('toDisplayTokens', () => {
  it('通常のトークンはそのまま、id と対応づけて返す', () => {
    expect(toDisplayTokens(['東京大学', 'の', '研究室'], [34224, 291, 25548])).toEqual([
      { id: 34224, text: '東京大学' },
      { id: 291, text: 'の' },
      { id: 25548, text: '研究室' },
    ]);
  });

  it('▁ は空白に戻す', () => {
    expect(texts(['AI', '▁は', '▁sugoi'], [1, 2, 3])).toEqual(['AI', ' は', ' sugoi']);
  });

  it('連続するバイトトークンを 1 文字に復元する', () => {
    // 「あ」= E3 81 82
    const out = toDisplayTokens(['<0xE3>', '<0x81>', '<0x82>'], [10, 11, 12]);
    // 3 トークンのまま（モデルにとっては 3 個）だが、表示は復元した文字にそろえる
    expect(out).toEqual([
      { id: 10, text: 'あ' },
      { id: 11, text: 'あ' },
      { id: 12, text: 'あ' },
    ]);
  });

  it('バイトトークンの前後に通常トークンがあっても混ざらない', () => {
    const out = texts(['猫', '<0xE3>', '<0x81>', '<0x82>', '犬'], [1, 2, 3, 4, 5]);
    expect(out).toEqual(['猫', 'あ', 'あ', 'あ', '犬']);
  });

  it('バイト列が複数の文字にまたがっても復元できる', () => {
    // 「あい」= E3 81 82 / E3 81 84
    const out = texts(['<0xE3>', '<0x81>', '<0x82>', '<0xE3>', '<0x81>', '<0x84>'], [1, 2, 3, 4, 5, 6]);
    expect(new Set(out)).toEqual(new Set(['あい']));
    expect(out).toHaveLength(6);
  });

  it('入力に無かった先頭の空白は落とす', () => {
    expect(texts(['▁', '先頭'], [271, 100])).toEqual(['先頭']);
  });

  it('先頭トークンに付いた空白だけを削る', () => {
    expect(texts(['▁こんにちは', '▁世界'], [1, 2])).toEqual(['こんにちは', ' 世界']);
  });

  it('id が足りなければ 0 で埋める（落とさない）', () => {
    expect(toDisplayTokens(['あ'], [])).toEqual([{ id: 0, text: 'あ' }]);
  });

  it('空入力は空配列', () => {
    expect(toDisplayTokens([], [])).toEqual([]);
  });

  it('小文字の 16 進表記も受ける', () => {
    expect(texts(['<0xe3>', '<0x81>', '<0x82>'], [1, 2, 3])).toEqual(['あ', 'あ', 'あ']);
  });
});
