import { describe, expect, it } from 'vitest';
import { pickTopTokens } from '../electron/nextTokenPick';

/** id をそのまま文字にする単純なデコーダ */
const decode = (id: number) => `t${id}`;
const none = new Set<number>();

describe('pickTopTokens', () => {
  it('確率の高い順に topK 個返す', () => {
    const out = pickTopTokens([1, 5, 3, 2], { topK: 2, special: none, decode });
    expect(out.map((x) => x.token)).toEqual(['t1', 't2']);
  });

  it('確率は softmax そのもの（合計1になる分布から取り出した値）', () => {
    const out = pickTopTokens([0, 0, 0, 0], { topK: 4, special: none, decode });
    for (const x of out) expect(x.prob).toBeCloseTo(0.25, 10);
    expect(out.reduce((a, x) => a + x.prob, 0)).toBeCloseTo(1, 10);
  });

  it('捨てた分を配り直さない（上位だけの合計は1にならない）', () => {
    // 「上位5つを足しても100%にならない」ことが、次の語が散らばっている説明になる
    const out = pickTopTokens([0, 0, 0, 0], { topK: 2, special: none, decode });
    expect(out.reduce((a, x) => a + x.prob, 0)).toBeCloseTo(0.5, 10);
  });

  it('logprob は prob の対数', () => {
    const [top] = pickTopTokens([0, 0], { topK: 1, special: none, decode });
    expect(Math.exp(top.logprob)).toBeCloseTo(top.prob, 12);
  });

  it('特殊トークンを飛ばしても topK 個そろえる', () => {
    // 1位・2位が特殊トークン。3位以降で埋まること
    const out = pickTopTokens([9, 8, 7, 6], { topK: 2, special: new Set([0, 1]), decode });
    expect(out.map((x) => x.token)).toEqual(['t2', 't3']);
  });

  it('特殊トークンを外しても、残った候補の確率は元のまま', () => {
    const out = pickTopTokens([0, 0, 0, 0], { topK: 1, special: new Set([0]), decode });
    expect(out[0].token).toBe('t1');
    expect(out[0].prob).toBeCloseTo(0.25, 10); // 0.33 に膨らませない
  });

  it('表示できない（空文字になる）トークンは出さない', () => {
    const out = pickTopTokens([9, 8, 7], { topK: 2, special: none, decode: (id) => (id === 0 ? '' : `t${id}`) });
    expect(out.map((x) => x.token)).toEqual(['t1', 't2']);
  });

  it('候補が topK に足りなければ、あるだけ返す', () => {
    const out = pickTopTokens([1, 2], { topK: 5, special: none, decode });
    expect(out).toHaveLength(2);
  });

  it('全部が特殊トークンなら空', () => {
    expect(pickTopTokens([1, 2], { topK: 3, special: new Set([0, 1]), decode })).toEqual([]);
  });

  it('大きなロジットでも NaN にならない（オーバーフロー対策が効いている）', () => {
    const out = pickTopTokens([1000, 999, 998], { topK: 3, special: none, decode });
    for (const x of out) expect(Number.isFinite(x.prob)).toBe(true);
    expect(out[0].prob).toBeGreaterThan(out[1].prob);
  });

  it('Float32Array（モデルの出力そのもの）を渡せる', () => {
    const out = pickTopTokens(new Float32Array([1, 3, 2]), { topK: 1, special: none, decode });
    expect(out[0].token).toBe('t1');
  });

  it('空の入力や topK=0 でも落ちない', () => {
    expect(pickTopTokens([], { topK: 3, special: none, decode })).toEqual([]);
    expect(pickTopTokens([1, 2], { topK: 0, special: none, decode })).toEqual([]);
  });
});
