import { describe, expect, it } from 'vitest';
import { isJapaneseVocabToken } from '../src/lib/tokenizer';

/**
 * o200k_base から近傍プール用の日本語を抜き出す条件のテスト。
 * ここが緩むと展示画面に中国語スパムが出るので、意図的に安全側へ倒してある。
 */
describe('isJapaneseVocabToken', () => {
  it.each(['ねこ', 'カタカナ', '大学', '勉強する', '東京大学'])('日本語の語 %o は採用', (s) => {
    expect(isJapaneseVocabToken(s)).toBe(true);
  });

  it('1文字は採用しない（近傍として意味が薄い）', () => {
    expect(isJapaneseVocabToken('猫')).toBe(false);
    expect(isJapaneseVocabToken('あ')).toBe(false);
  });

  it('12文字を超えるものは採用しない', () => {
    expect(isJapaneseVocabToken('あ'.repeat(12))).toBe(true);
    expect(isJapaneseVocabToken('あ'.repeat(13))).toBe(false);
  });

  it.each(['hello', 'AI技術', '猫 犬', '第1位', '猫！', ''])('記号や英数字が混ざる %o は採用しない', (s) => {
    expect(isJapaneseVocabToken(s)).toBe(false);
  });

  it('常用漢字だけで構成される語は採用する', () => {
    expect(isJapaneseVocabToken('学校')).toBe(true);
  });

  it('常用漢字でない漢字だけの語は採用しない（中国語よけ）', () => {
    expect(isJapaneseVocabToken('龘龘')).toBe(false);
  });

  it('かなを含めば常用漢字の縛りは掛からない', () => {
    // 「龘」は常用外だが、かなを含むので日本語とみなす
    expect(isJapaneseVocabToken('龘い')).toBe(true);
  });

  it.each(['彩票', '毛片', '色情', '人妻'])('賭博・アダルト系の語幹 %o は除外する', (s) => {
    expect(isJapaneseVocabToken(s)).toBe(false);
  });

  it('語幹を含む長い語も除外する', () => {
    expect(isJapaneseVocabToken('中国彩票網')).toBe(false);
  });
});
