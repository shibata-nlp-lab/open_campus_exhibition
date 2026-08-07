import { describe, expect, it } from 'vitest';
import { cosine, pca2, pseudoEmbed } from '../src/lib/vec';

describe('cosine', () => {
  it('同じ向きなら 1、直交なら 0', () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 3])).toBeCloseTo(0);
  });

  it('次元が違うベクトルは NaN ではなく 0 を返す', () => {
    // 疑似ベクトルと実埋め込みが混ざったときに NaN が画面に出ないための防御
    expect(cosine([1, 0, 0], [1, 0])).toBe(0);
    expect(cosine([], [1])).toBe(0);
  });

  it('ゼロベクトルでも NaN にならない', () => {
    expect(Number.isNaN(cosine([0, 0], [1, 1]))).toBe(false);
  });
});

describe('pseudoEmbed', () => {
  it('指定した次元で、長さ1に正規化されたベクトルを返す', () => {
    const v = pseudoEmbed('こんにちは', 256);
    expect(v).toHaveLength(256);
    expect(Math.hypot(...v)).toBeCloseTo(1, 6);
  });

  it('同じ文字列からは必ず同じ結果になる（オフライン時に結果が揺れない）', () => {
    expect(pseudoEmbed('猫', 64)).toEqual(pseudoEmbed('猫', 64));
  });

  it('違う文字列は違う結果になる', () => {
    expect(pseudoEmbed('猫', 64)).not.toEqual(pseudoEmbed('犬', 64));
  });
});

describe('pca2', () => {
  it('入力と同じ数の 2 次元座標を返す', () => {
    const pts = pca2([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
    ]);
    expect(pts).toHaveLength(4);
    for (const p of pts) {
      expect(p).toHaveLength(2);
      expect(Number.isFinite(p[0])).toBe(true);
      expect(Number.isFinite(p[1])).toBe(true);
    }
  });

  it('空配列でも落ちない', () => {
    expect(pca2([])).toEqual([]);
  });

  it('第1主成分がばらつきの大きい軸に向く', () => {
    // x 方向にだけ広がっているデータ
    const pts = pca2([
      [-10, 0],
      [0, 0],
      [10, 0],
    ]);
    const spread = Math.max(...pts.map((p) => Math.abs(p[0])));
    expect(spread).toBeGreaterThan(5);
  });
});
