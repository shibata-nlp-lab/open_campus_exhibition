import { describe, expect, it } from 'vitest';
import {
  BET_LABELS,
  betKey,
  bracketOf,
  brackets,
  buildOdds,
  finishOrder,
  hitProbabilities,
  impliedProbs,
  lognormal,
  makeRng,
  payout,
  PAYOUT_RATE,
  raceOdds,
  roundOdds,
  winningKeys,
  type BetKind,
} from '../src/lib/odds';

const KINDS = Object.keys(BET_LABELS) as BetKind[];
const entries = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ oddsMean: 2 + i * 2, oddsVar: (0.18 * (2 + i * 2)) ** 2 }));

describe('乱数', () => {
  it('同じシードなら同じ列（展示中に値が変わらない）', () => {
    const a = Array.from({ length: 5 }, makeRng(42));
    const b = Array.from({ length: 5 }, makeRng(42));
    expect(a).toEqual(b);
  });

  it('違うシードなら違う列', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });

  it('0..1 に収まる', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 2000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('対数正規分布', () => {
  it('指定した平均・分散になる（モーメントマッチング）', () => {
    const rng = makeRng(3);
    const xs = Array.from({ length: 40000 }, () => lognormal(5, 4, rng));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const varr = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    expect(mean).toBeCloseTo(5, 0);
    expect(varr).toBeGreaterThan(3);
    expect(varr).toBeLessThan(5.5);
  });

  it('必ず正（オッズとして使える）', () => {
    const rng = makeRng(9);
    for (let i = 0; i < 5000; i++) expect(lognormal(1.2, 9, rng)).toBeGreaterThan(0);
  });
});

describe('オッズの丸め', () => {
  it('10倍未満は0.1刻み、100倍未満は1刻み、それ以上は10刻み', () => {
    expect(roundOdds(3.14)).toBe(3.1);
    expect(roundOdds(45.6)).toBe(46);
    expect(roundOdds(456)).toBe(460);
  });

  it('1.0 倍を下回らない（元返し以下にはならない）', () => {
    expect(roundOdds(0.2)).toBe(1);
  });

  it('上限で頭打ちになる', () => {
    expect(roundOdds(1e9)).toBe(9999.9);
  });
});

describe('枠番', () => {
  it('8頭以下は1頭1枠', () => {
    expect(brackets(8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('9頭は8枠だけ2頭', () => {
    expect(brackets(9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8]);
  });

  it('16頭はすべての枠が2頭', () => {
    expect(brackets(16)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8]);
  });

  it('18頭は7・8枠が3頭', () => {
    const b = brackets(18);
    expect(b.filter((x) => x === 7)).toHaveLength(3);
    expect(b.filter((x) => x === 8)).toHaveLength(3);
    expect(b.filter((x) => x === 1)).toHaveLength(2);
  });

  it('どの頭数でも 1..8 に収まり、枠番は単調に増える', () => {
    for (let n = 8; n <= 18; n++) {
      const b = brackets(n);
      expect(Math.min(...b)).toBe(1);
      expect(Math.max(...b)).toBe(8);
      for (let i = 1; i < n; i++) expect(b[i]).toBeGreaterThanOrEqual(b[i - 1]);
      expect(bracketOf(n - 1, n)).toBe(8);
    }
  });
});

describe('券種のキー', () => {
  it('順不同の券種は選んだ順番によらず同じキー', () => {
    expect(betKey('quinella', [5, 2])).toBe(betKey('quinella', [2, 5]));
    expect(betKey('trio', [7, 1, 4])).toBe(betKey('trio', [1, 4, 7]));
  });

  it('着順どおりの券種は順番で別のキー', () => {
    expect(betKey('exacta', [1, 2])).not.toBe(betKey('exacta', [2, 1]));
    expect(betKey('trifecta', [1, 2, 3])).not.toBe(betKey('trifecta', [1, 3, 2]));
  });
});

describe('Harville モデル', () => {
  const p = [0.3, 0.25, 0.2, 0.1, 0.06, 0.04, 0.03, 0.02];
  const hits = hitProbabilities(p);

  it('単勝は勝率そのもの', () => {
    p.forEach((v, i) => expect(hits.win.get(betKey('win', [i]))).toBeCloseTo(v, 12));
  });

  it('3連単の合計が 1 になる（着順分布が閉じている）', () => {
    const sum = [...hits.trifecta.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 8);
  });

  it('複勝の合計が 3 になる（3頭が3着以内に入る）', () => {
    const sum = [...hits.place.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(3, 8);
  });

  it('ワイドの合計が 3 になる（3頭から2頭を選ぶ組は3通り）', () => {
    const sum = [...hits.wide.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(3, 8);
  });

  it('馬連・馬単・3連複も合計 1', () => {
    for (const k of ['quinella', 'exacta', 'trio', 'bracket'] as const) {
      const sum = [...hits[k].values()].reduce((a, b) => a + b, 0);
      expect(sum, k).toBeCloseTo(1, 8);
    }
  });

  it('複勝の確率は単勝以上（3着以内のほうが起きやすい）', () => {
    p.forEach((_, i) => {
      expect(hits.place.get(betKey('place', [i]))!).toBeGreaterThanOrEqual(hits.win.get(betKey('win', [i]))!);
    });
  });

  it('馬連は同じ組の馬単2通りの合計', () => {
    const q = hits.quinella.get(betKey('quinella', [0, 3]))!;
    const a = hits.exacta.get(betKey('exacta', [0, 3]))!;
    const b = hits.exacta.get(betKey('exacta', [3, 0]))!;
    expect(q).toBeCloseTo(a + b, 12);
  });
});

describe('市場の推定勝率', () => {
  it('合計が 1 になる', () => {
    const q = impliedProbs([2, 4, 8, 10, 20, 30, 50, 100]);
    expect(q.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('オッズが低いほど勝率が高い', () => {
    const q = impliedProbs([2, 4, 8]);
    expect(q[0]).toBeGreaterThan(q[1]);
    expect(q[1]).toBeGreaterThan(q[2]);
  });
});

describe('オッズ表', () => {
  it('同じシードなら同じオッズ（再現性）', () => {
    const a = raceOdds(entries(12), 1234);
    const b = raceOdds(entries(12), 1234);
    expect(a.win).toEqual(b.win);
    expect([...a.odds.trifecta.entries()].sort()).toEqual([...b.odds.trifecta.entries()].sort());
  });

  it('シードが違えばオッズも変わる', () => {
    expect(raceOdds(entries(12), 1).win).not.toEqual(raceOdds(entries(12), 2).win);
  });

  it('全券種にオッズが入り、1.0 倍を下回らない', () => {
    const { odds } = raceOdds(entries(12), 55);
    for (const k of KINDS) {
      expect(odds[k].size, k).toBeGreaterThan(0);
      for (const v of odds[k].values()) expect(v).toBeGreaterThanOrEqual(1);
    }
  });

  it('人気の馬ほど3連単も安い（単勝から素直に導けている）', () => {
    const { odds } = raceOdds(entries(12), 77);
    const fav = odds.trifecta.get(betKey('trifecta', [0, 1, 2]))!;
    const out = odds.trifecta.get(betKey('trifecta', [9, 10, 11]))!;
    expect(fav).toBeLessThan(out);
  });

  it('1点あたりの期待値が控除率のまわりに収まる（買っても損をする）', () => {
    // 的中確率 × オッズ ≒ 控除率。1 を割っているのが馬券の性質で、ここが崩れると
    // 買い続ければ儲かる券種が生まれてしまう
    const rng = makeRng(5);
    const win = [2, 3, 5, 8, 12, 20, 40, 80];
    const hits = hitProbabilities(impliedProbs(win));
    const odds = buildOdds(hits, win, rng);
    for (const k of ['quinella', 'exacta', 'trio', 'trifecta'] as const) {
      const evs = [...odds[k].entries()].map(([key, o]) => hits[k].get(key)! * o);
      const mean = evs.reduce((a, b) => a + b, 0) / evs.length;
      expect(mean, k).toBeGreaterThan(PAYOUT_RATE[k] * 0.85);
      expect(mean, k).toBeLessThan(PAYOUT_RATE[k] * 1.2);
      expect(mean, k).toBeLessThan(1);
    }
  });
});

describe('着順と払戻', () => {
  const finalProbs = [0.05, 0.3, 0.02, 0.25, 0.1, 0.08, 0.07, 0.06, 0.04, 0.03];
  const order = finishOrder(finalProbs);
  const count = finalProbs.length;

  it('最終出力確率の降順が着順', () => {
    expect(order[0]).toBe(1); // 0.30
    expect(order[1]).toBe(3); // 0.25
    expect(order[2]).toBe(4); // 0.10
  });

  it('同じ確率なら番号の若い順', () => {
    expect(finishOrder([0.5, 0.5, 0.1])).toEqual([0, 1, 2]);
  });

  it('的中キーが着順と一致する', () => {
    expect(winningKeys('win', order, count)).toEqual([betKey('win', [1])]);
    expect(winningKeys('trifecta', order, count)).toEqual([betKey('trifecta', [1, 3, 4])]);
    expect(winningKeys('place', order, count)).toHaveLength(3);
    expect(winningKeys('wide', order, count)).toHaveLength(3);
  });

  it('馬単は着順が逆だと外れる', () => {
    const { odds } = raceOdds(entries(count), 11);
    expect(payout({ kind: 'exacta', picks: [1, 3], amount: 1000 }, odds, order, count)).toBeGreaterThan(0);
    expect(payout({ kind: 'exacta', picks: [3, 1], amount: 1000 }, odds, order, count)).toBe(0);
  });

  it('馬連は順番が逆でも当たる', () => {
    const { odds } = raceOdds(entries(count), 11);
    const a = payout({ kind: 'quinella', picks: [1, 3], amount: 1000 }, odds, order, count);
    const b = payout({ kind: 'quinella', picks: [3, 1], amount: 1000 }, odds, order, count);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });

  it('3着までに入っていれば複勝は当たる', () => {
    const { odds } = raceOdds(entries(count), 11);
    expect(payout({ kind: 'place', picks: [4], amount: 1000 }, odds, order, count)).toBeGreaterThan(0);
    expect(payout({ kind: 'place', picks: [2], amount: 1000 }, odds, order, count)).toBe(0);
  });

  it('払戻は賭け金 × オッズ（円未満切り捨て）', () => {
    const { odds } = raceOdds(entries(count), 11);
    const o = odds.win.get(betKey('win', [1]))!;
    expect(payout({ kind: 'win', picks: [1], amount: 1500 }, odds, order, count)).toBe(Math.floor(1500 * o));
  });

  it('枠連は枠番で判定する', () => {
    const frame = brackets(count);
    const { odds } = raceOdds(entries(count), 11);
    const hit = payout({ kind: 'bracket', picks: [frame[1], frame[3]], amount: 1000 }, odds, order, count);
    expect(hit).toBeGreaterThan(0);
  });
});
