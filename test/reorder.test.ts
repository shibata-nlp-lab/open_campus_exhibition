import { describe, expect, it } from 'vitest';
import { shiftIndex } from '../src/lib/reorder';

/** 実際の並べ替えと同じ動き */
const move = <T,>(arr: T[], from: number, to: number): T[] => {
  const a = arr.slice();
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
};

describe('並べ替えたときの正解の追従', () => {
  it('どう動かしても、正解は同じ選択肢を指し続ける', () => {
    for (let n = 2; n <= 8; n++) {
      const base = Array.from({ length: n }, (_, i) => `c${i}`);
      for (let answer = 0; answer < n; answer++) {
        for (let from = 0; from < n; from++) {
          for (let to = 0; to < n; to++) {
            const after = move(base, from, to);
            expect(after[shiftIndex(answer, from, to)], `n=${n} ans=${answer} ${from}→${to}`).toBe(base[answer]);
          }
        }
      }
    }
  });

  it('正解そのものを動かすと、移動先が新しい正解になる', () => {
    expect(shiftIndex(2, 2, 0)).toBe(0);
    expect(shiftIndex(0, 0, 4)).toBe(4);
  });

  it('正解より後ろだけをいじっても正解は動かない', () => {
    expect(shiftIndex(0, 3, 5)).toBe(0);
    expect(shiftIndex(1, 4, 2)).toBe(1);
  });

  it('同じ場所へ動かしたら何も変わらない', () => {
    for (let i = 0; i < 5; i++) expect(shiftIndex(i, i, i)).toBe(i);
  });
});
