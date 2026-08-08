import { describe, expect, it } from 'vitest';
import {
  buildRaceCurve,
  finishPositions,
  movingAverage,
  pickRaces,
  positionAt,
  ranksAt,
  standardizedLogits,
} from '../src/lib/race';
import { finishOrder } from '../src/lib/odds';
import { laneOffset, LAP_METERS, perimeter, pointAt, racePoint, type TrackShape } from '../src/lib/track';

/** logit lens らしく、層ごとに順位が暴れるデータを作る */
function noisyLayers(n: number, T: number, finalProbs: number[], seed = 1): number[][] {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: T }, (_, t) => {
      const pull = t / (T - 1); // 後半ほど最終確率に近づく
      const noise = Math.exp((rnd() - 0.5) * 6 * (1 - pull));
      return Math.max(1e-9, finalProbs[i] * noise);
    })
  );
}

describe('移動平均', () => {
  it('長さが変わらない', () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toHaveLength(5);
  });

  it('端は窓を縮める（両端が平均に引っぱられすぎない）', () => {
    expect(movingAverage([0, 0, 9], 3)[0]).toBeCloseTo(0, 12);
  });

  it('一定の系列は変わらない', () => {
    expect(movingAverage([2, 2, 2, 2], 5)).toEqual([2, 2, 2, 2]);
  });
});

describe('標準化', () => {
  it('各層で平均0・分散1になる', () => {
    const z = standardizedLogits([
      [0.5, 0.1],
      [0.3, 0.6],
      [0.2, 0.3],
    ]);
    for (let t = 0; t < 2; t++) {
      const col = z.map((r) => r[t]);
      const mean = col.reduce((a, b) => a + b, 0) / col.length;
      expect(mean).toBeCloseTo(0, 10);
    }
  });

  it('確率0でも壊れない（log が -Infinity にならない）', () => {
    const z = standardizedLogits([[0], [0.5]]);
    expect(z.every((r) => r.every(Number.isFinite))).toBe(true);
  });
});

describe('ゴール地点', () => {
  it('1着は距離ちょうど', () => {
    expect(Math.max(...finishPositions([0.1, 0.5, 0.2], 2400))).toBe(2400);
  });

  it('確率が低いほど後ろ', () => {
    const f = finishPositions([0.5, 0.2, 0.01], 2400);
    expect(f[0]).toBeGreaterThan(f[1]);
    expect(f[1]).toBeGreaterThan(f[2]);
  });

  it('どんなに差があっても距離の15%までしか下がらない', () => {
    const f = finishPositions([0.9, 1e-9], 2400);
    expect(Math.min(...f)).toBeGreaterThanOrEqual(2400 * 0.85);
  });
});

describe('レースの走り', () => {
  const finals = [0.3, 0.22, 0.15, 0.1, 0.08, 0.06, 0.04, 0.03, 0.015, 0.005];
  const layers = noisyLayers(finals.length, 24, finals, 12345);
  const curve = buildRaceCurve(layers, finals, 100);

  it('距離は 層数 × 1層あたりの距離', () => {
    expect(curve.distance).toBe(2400);
  });

  it('着順が最終出力確率の順と必ず一致する（これが正解になる）', () => {
    const last = curve.positions.map((p) => p[p.length - 1]);
    const byPosition = last.map((x, i) => ({ x, i })).sort((a, b) => b.x - a.x).map((o) => o.i);
    expect(byPosition).toEqual(finishOrder(finals));
  });

  it('元データが荒れていても着順は変わらない', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const c = buildRaceCurve(noisyLayers(finals.length, 24, finals, seed), finals, 100);
      const last = c.positions.map((p) => p[p.length - 1]);
      const order = last.map((x, i) => ({ x, i })).sort((a, b) => b.x - a.x).map((o) => o.i);
      expect(order, `seed=${seed}`).toEqual(finishOrder(finals));
    }
  });

  it('馬は後ろに戻らない（位置が単調に増える）', () => {
    for (const p of curve.positions) {
      for (let t = 1; t < p.length; t++) expect(p[t]).toBeGreaterThan(p[t - 1]);
    }
  });

  it('途中では順位が入れ替わる（レースとして成立している）', () => {
    const seen = new Set<string>();
    for (let t = 0; t <= 20; t++) seen.add(ranksAt(curve.positions, t / 20).join(','));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('順位の入れ替わりが1層ごとに暴れない（補正が効いている）', () => {
    // 極端に荒れた入力を 30 本流して平均を見る。1本だとたまたまで通ってしまう
    let total = 0;
    const runs = 30;
    for (let seed = 1; seed <= runs; seed++) {
      const c = buildRaceCurve(noisyLayers(finals.length, 24, finals, seed), finals, 100);
      const T = c.positions[0].length;
      let jumps = 0;
      for (let t = 1; t < T; t++) {
        const a = ranksAt(c.positions, (t - 1) / (T - 1));
        const b = ranksAt(c.positions, t / (T - 1));
        jumps += a.reduce((s, r, i) => s + Math.abs(r - b[i]), 0);
      }
      total += jumps / (T - 1);
    }
    // 1層あたりの順位変動の合計が、頭数の半分より小さいこと（10頭なら 5 未満）
    expect(total / runs).toBeLessThan(finals.length / 2);
  });

  it('層が1つでも壊れない', () => {
    const c = buildRaceCurve([[0.5], [0.3], [0.2]], [0.5, 0.3, 0.2], 100);
    expect(c.distance).toBe(100);
    expect(c.positions).toHaveLength(3);
  });

  it('空でも落ちない', () => {
    expect(buildRaceCurve([], [], 100).distance).toBe(0);
  });
});

describe('位置の補間', () => {
  it('端は端の値', () => {
    expect(positionAt([0, 10, 20], 0)).toBe(0);
    expect(positionAt([0, 10, 20], 1)).toBe(20);
  });

  it('あいだは線形（60fps でもカクつかない）', () => {
    expect(positionAt([0, 10, 20], 0.25)).toBeCloseTo(5, 10);
  });

  it('範囲外は丸める', () => {
    expect(positionAt([0, 10], -1)).toBe(0);
    expect(positionAt([0, 10], 5)).toBe(10);
  });
});

describe('コース', () => {
  const shape: TrackShape = { straight: 520, radius: 176, cx: 500, cy: 260 };

  it('1周すると元の位置に戻る', () => {
    const a = pointAt(shape, 0);
    const b = pointAt(shape, perimeter(shape));
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });

  it('座標が連続している（コーナーで飛ばない）', () => {
    const P = perimeter(shape);
    let prev = pointAt(shape, 0);
    for (let i = 1; i <= 2000; i++) {
      const p = pointAt(shape, (P * i) / 2000);
      expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(P / 500);
      prev = p;
    }
  });

  it('向きも連続している（コーナーで回り込む）', () => {
    const P = perimeter(shape);
    let prev = pointAt(shape, 0).heading;
    for (let i = 1; i <= 2000; i++) {
      const h = pointAt(shape, (P * i) / 2000).heading;
      let d = Math.abs(h - prev) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      expect(d).toBeLessThan(0.1);
      prev = h;
    }
  });

  it('直線では向きが変わらない', () => {
    expect(pointAt(shape, 10).heading).toBeCloseTo(pointAt(shape, 200).heading, 10);
  });

  it('コーナーでは向きが変わる', () => {
    const arcStart = shape.straight + 10;
    expect(pointAt(shape, arcStart).heading).not.toBeCloseTo(pointAt(shape, arcStart + 200).heading, 2);
  });

  it('ゴールがちょうどゴール板に来る', () => {
    const goal = pointAt(shape, 0);
    const p = racePoint(shape, 2400, 2400);
    expect(p.x).toBeCloseTo(goal.x, 6);
    expect(p.y).toBeCloseTo(goal.y, 6);
  });

  it('スタート地点はレース距離ぶん手前', () => {
    const start = racePoint(shape, 0, 1600);
    // 1600m ＝ ちょうど1周なので、スタートとゴールが同じ地点になる
    expect(start.x).toBeCloseTo(pointAt(shape, 0).x, 6);
    expect(LAP_METERS).toBe(1600);
  });

  it('外のレーンほどコースの中心から遠い', () => {
    const p = pointAt(shape, 100); // 手前の直線
    const inner = laneOffset(p, 0, 7);
    const outer = laneOffset(p, 5, 7);
    const d = (q: { x: number; y: number }) => Math.hypot(q.x - shape.cx, q.y - shape.cy);
    expect(d(outer)).toBeGreaterThan(d(inner));
  });
});

describe('その回に使うレースを選ぶ', () => {
  const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  it('指定した数だけ返す', () => {
    expect(pickRaces(pool, 5)).toHaveLength(5);
  });

  it('同じレースを2回入れない', () => {
    for (let i = 0; i < 50; i++) {
      const got = pickRaces(pool, 5);
      expect(new Set(got).size).toBe(5);
    }
  });

  it('登録が足りなければあるだけ返す', () => {
    expect(pickRaces(['a', 'b'], 5)).toHaveLength(2);
    expect(pickRaces([], 5)).toEqual([]);
  });

  it('元の配列を壊さない', () => {
    const copy = pool.slice();
    pickRaces(pool, 3);
    expect(pool).toEqual(copy);
  });

  it('毎回同じ並びにならない（回ごとに違うレースになる）', () => {
    const seen = new Set(Array.from({ length: 40 }, () => pickRaces(pool, 3).join(',')));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('どのレースも選ばれる可能性がある（後ろが死票にならない）', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) for (const r of pickRaces(pool, 3)) seen.add(r);
    expect(seen.size).toBe(pool.length);
  });

  it('乱数を渡せば結果が決まる（テストできる）', () => {
    const fixed = () => 0;
    expect(pickRaces(pool, 3, fixed)).toEqual(pickRaces(pool, 3, fixed));
  });
});
