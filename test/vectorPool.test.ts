import { describe, expect, it } from 'vitest';
import { meanPool, normalize } from '../electron/vectorPool';

const len = (v: number[]) => Math.hypot(...v);

describe('normalize', () => {
  it('長さ 1 にそろえる', () => {
    expect(len(normalize([3, 4]))).toBeCloseTo(1);
  });

  it('0 ベクトルは NaN にせずそのまま返す', () => {
    expect(normalize([0, 0])).toEqual([0, 0]);
  });

  it('向きは変えない', () => {
    const v = normalize([3, 4]);
    expect(v[0] / v[1]).toBeCloseTo(3 / 4);
  });
});

describe('meanPool', () => {
  it('1 トークンならその行を正規化して返す', () => {
    expect(meanPool([[3, 4]], 2)).toEqual(normalize([3, 4]));
  });

  it('複数トークンは平均してから正規化する（「トレーニング」のような語）', () => {
    const out = meanPool(
      [
        [2, 0],
        [0, 2],
      ],
      2
    );
    expect(len(out)).toBeCloseTo(1);
    expect(out[0]).toBeCloseTo(out[1]); // 平均は対角方向
  });

  it('Float32Array でも受けられる', () => {
    const out = meanPool([new Float32Array([1, 0]), new Float32Array([0, 1])], 2);
    expect(len(out)).toBeCloseTo(1);
  });

  it('トークンが 1 つも無ければ 0 ベクトル（次元はそろえる）', () => {
    // 次元がずれると cosine が NaN になるので、長さだけは必ず保つ
    expect(meanPool([], 4)).toEqual([0, 0, 0, 0]);
  });

  it('打ち消し合って 0 になっても NaN を返さない', () => {
    const out = meanPool(
      [
        [1, 0],
        [-1, 0],
      ],
      2
    );
    expect(out.every((x) => Number.isFinite(x))).toBe(true);
  });
});
