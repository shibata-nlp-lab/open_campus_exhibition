/** ベクトルの後処理。ファイルにも Electron にも依存しない */

/**
 * サブワードに割れた語のベクトルをまとめる。
 * 「トレーニング」のように複数トークンになる語があるので、平均を取ってから L2 正規化する。
 * 空（トークンが1つも無い）のときは 0 ベクトルを返す。
 */
export function meanPool(rows: ArrayLike<number>[], dim: number): number[] {
  const out = new Array<number>(dim).fill(0);
  if (rows.length === 0) return out;
  for (const r of rows) {
    for (let k = 0; k < dim; k++) out[k] += r[k];
  }
  for (let k = 0; k < dim; k++) out[k] /= rows.length;
  return normalize(out);
}

/** 長さ 1 にそろえる。0 ベクトルはそのまま返す（0 除算で NaN にしない） */
export function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const n = Math.sqrt(sum);
  return n > 0 ? v.map((x) => x / n) : v;
}
