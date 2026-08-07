import { describe, expect, it } from 'vitest';
import { idsForTexts, listLlmJpVocab, tokenizeLlmJp } from '../src/lib/llmjp';
import { isJapaneseVocabToken } from '../src/lib/tokenizer';

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

describe('idsForTexts（埋め込み層を引くための ID 列）', () => {
  it('語ごとにトークンID の配列を返す', async () => {
    const ids = await idsForTexts(['東京大学', '猫']);
    expect(ids).toHaveLength(2);
    expect(ids[0].length).toBeGreaterThan(0);
    for (const g of ids) for (const id of g) expect(id).toBeGreaterThanOrEqual(0);
  });

  it('分割数と ID の数が一致する', async () => {
    const r = await tokenizeLlmJp('機械学習を勉強したい');
    const ids = await idsForTexts(['機械学習を勉強したい']);
    expect(ids[0]).toHaveLength(r!.tokens.length);
  });

  it('空文字は空の配列（平均プーリング側で 0 ベクトルになる）', async () => {
    expect(await idsForTexts([''])).toEqual([[]]);
  });

  it('同じ語からは必ず同じ ID 列が出る', async () => {
    expect(await idsForTexts(['学校'])).toEqual(await idsForTexts(['学校']));
  });
});

describe('listLlmJpVocab の重複排除', () => {
  it('同じ表層の語が 2 回出てこない（▁学校 と 学校 は別トークンだが表示は同じ）', async () => {
    const words = await listLlmJpVocab();
    expect(new Set(words).size).toBe(words.length);
  });
});

describe('listLlmJpVocab のプール品質', () => {
  it('上限 6,000 語に収める（キャッシュが数百MBに膨らむのを防ぐ）', async () => {
    expect(await listLlmJpVocab()).toHaveLength(6000);
  });

  it('中国語が混じらない（o200k 側と同じ日本語判定を通す）', async () => {
    const words = await listLlmJpVocab();
    expect(words).not.toContain('获取');
    expect(words).not.toContain('一个');
  });

  it('数字の羅列ではなく、よく使う語が入る（語彙ファイルの並び順ではなくスコア順）', async () => {
    const words = await listLlmJpVocab();
    // 語彙ファイルの先頭は 一一 一二 … なので、並び順のまま取ると数字だらけになる
    expect(words.slice(0, 50).filter((w) => /^[一二三四五六七八九十]{2}$/.test(w)).length).toBeLessThan(5);
    expect(words).toContain('日本');
  });

  it('すべて日本語の語として妥当', async () => {
    for (const w of await listLlmJpVocab()) expect(isJapaneseVocabToken(w)).toBe(true);
  });
});
