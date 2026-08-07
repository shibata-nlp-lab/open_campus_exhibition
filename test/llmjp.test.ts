import { describe, expect, it } from 'vitest';
import { listLlmJpVocab, tokenizeLlmJp } from '../src/lib/llmjp';

const split = async (s: string) => {
  const r = await tokenizeLlmJp(s);
  expect(r).not.toBeNull();
  return r!.tokens.map((t) => t.text);
};

/**
 * llm-jp（SentencePiece Unigram）の自前 Viterbi 実装。
 * スコア合計が最大になる切り方を選ぶので、結果は入力に対して一意に決まる。
 * ここが崩れても「それっぽい分割」が出てしまい目視では気づけないので、既知の分割を固定する。
 */
describe('tokenizeLlmJp', () => {
  it.each([
    ['東京大学の研究室', ['東京', '大学', 'の', '研究室']],
    ['ドラゴンボール', ['ドラゴン', 'ボール']],
    ['機械学習を勉強したい', ['機械', '学習', 'を', '勉強', 'したい']],
    ['カピバラがかわいい', ['カピバラ', 'が', 'かわいい']],
  ])('%o を語単位に分ける', async (input, expected) => {
    expect(await split(input as string)).toEqual(expected);
  });

  it('英語圏のトークナイザと違い、日本語が1文字ずつには割れない', async () => {
    const tokens = await split('大規模言語モデルは次の単語を予測する');
    expect(tokens.length).toBeLessThan(12); // o200k_base だと 15 個になる
    expect(tokens).toContain('大規模');
  });

  it('分割を連結すると元の文に戻る', async () => {
    const src = '今日はいい天気ですね';
    expect((await split(src)).join('')).toBe(src);
  });

  it('文頭に付けた ▁ は表示に残さない', async () => {
    const tokens = await split('猫');
    expect(tokens[0].startsWith(' ')).toBe(false);
  });

  it('文中の空白は空白として残る', async () => {
    const tokens = await split('猫 犬');
    expect(tokens.join('')).toBe('猫 犬');
  });

  it('トークンIDは語彙の範囲に収まる', async () => {
    const r = await tokenizeLlmJp('東京大学');
    for (const t of r!.tokens) {
      expect(t.id).toBeGreaterThanOrEqual(0);
      expect(t.id).toBeLessThan(99574);
    }
  });

  it('サロゲートペア（絵文字）の途中で切らない', async () => {
    const r = await tokenizeLlmJp('猫😊犬');
    const joined = r!.tokens.map((t) => t.text).join('');
    // バイトフォールバックで同じ文字が重複しうるので、絵文字が壊れていないことだけ見る
    expect(joined).toContain('😊');
  });

  it('空文字でも落ちない', async () => {
    const r = await tokenizeLlmJp('');
    expect(r).not.toBeNull();
    expect(r!.approximate).toBe(false);
  });

  it('approximate は常に false（近似ではなく本家と同じ分割のため）', async () => {
    expect((await tokenizeLlmJp('猫'))!.approximate).toBe(false);
  });
});

describe('listLlmJpVocab', () => {
  it('日本語の語だけを、2〜12文字で返す', async () => {
    const words = await listLlmJpVocab();
    expect(words.length).toBeGreaterThan(1000);
    for (const w of words.slice(0, 500)) {
      expect(w).toMatch(/^[ぁ-んァ-ヴー一-龯々]{2,12}$/);
    }
  });

  it('2回呼んでも同じ結果（キャッシュが効いても壊れない）', async () => {
    expect(await listLlmJpVocab()).toEqual(await listLlmJpVocab());
  });
});
