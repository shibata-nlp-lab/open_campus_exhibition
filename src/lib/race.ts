/**
 * 層ごとの確率を「レースの走り」に変換する。
 *
 * logit lens の順位は層ごとに激しく入れ替わるので、そのままでは競馬にならない。
 * ここで
 *   1. 層方向にならす
 *   2. 後半ほど最終確率へ寄せる
 *   3. 速度として積み上げ、ゴール地点で正規化する
 * という順に処理する。3 のおかげで**着順は必ず最終出力確率の順**になり、
 * 途中だけが自由に入れ替わる。設計の意図は
 * [docs/betting-mode.md](../../docs/betting-mode.md) を参照。
 */

/** 速度が強さにどれだけ引っぱられるか。大きいほど着差が開く */
const SPEED_GAIN = 0.25;
/** 速度の下限。0 以下になると馬が止まる／戻るので必ず正にする */
const MIN_SPEED = 0.2;
/**
 * 層方向の移動平均の窓（奇数）。
 * 5 だと 1層あたりの順位変動が 10頭で 5.2、7 で 4.6 まで落ちる。
 * これ以上広げると逆転そのものが減ってレースが単調になるので 7 で止めている。
 */
const SMOOTH_WINDOW = 7;
/** ゴール地点の差：logit 0.1 あたり何 m 後ろにするか */
const METERS_PER_LOGIT = 20;
/** 最後方でも距離の何割までしか下げない */
const MAX_GAP_RATIO = 0.15;

/** 層ごとの標準化した強さ（z スコア）。層数 × 頭数 */
export function standardizedLogits(layerProbs: number[][]): number[][] {
  const n = layerProbs.length;
  if (n === 0) return [];
  const T = layerProbs[0].length;
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(T).fill(0));
  for (let t = 0; t < T; t++) {
    const col = layerProbs.map((row) => Math.log(Math.max(row[t], 1e-12)));
    const mean = col.reduce((a, b) => a + b, 0) / n;
    const varr = col.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const sd = Math.sqrt(varr) || 1;
    for (let i = 0; i < n; i++) out[i][t] = (col[i] - mean) / sd;
  }
  return out;
}

/** 移動平均。端は窓を縮めるので、系列の長さは変わらない */
export function movingAverage(xs: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return xs.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(xs.length - 1, i + half);
    let s = 0;
    for (let k = from; k <= to; k++) s += xs[k];
    return s / (to - from + 1);
  });
}

/**
 * ゴール地点（m）。1着は距離ちょうど、以下は最終 logit の差に応じて後ろに置く。
 * これが着順そのものになる。
 */
export function finishPositions(finalProbs: number[], distance: number): number[] {
  const logits = finalProbs.map((p) => Math.log(Math.max(p, 1e-12)));
  const top = Math.max(...logits);
  const maxGap = distance * MAX_GAP_RATIO;
  return logits.map((l) => distance - Math.min(maxGap, (top - l) * METERS_PER_LOGIT));
}

export interface RaceCurve {
  /** [頭][層] の位置（m）。層 0 はスタート直後 */
  positions: number[][];
  /** 各馬のゴール地点（m） */
  finish: number[];
  /** レース距離（m） */
  distance: number;
  /** 補正後の強さ。グラフ表示用 */
  smoothed: number[][];
}

/**
 * 層ごとの確率からレースの走りを作る。
 *
 * @param layerProbs [頭][層] の確率
 * @param finalProbs 最終出力確率（着順の根拠）
 * @param metersPerLayer 1層あたりの距離（既定 100m）
 */
export function buildRaceCurve(
  layerProbs: number[][],
  finalProbs: number[],
  metersPerLayer = 100
): RaceCurve {
  const n = layerProbs.length;
  const T = n > 0 ? layerProbs[0].length : 0;
  const distance = T * metersPerLayer;
  if (n === 0 || T === 0) return { positions: [], finish: [], distance: 0, smoothed: [] };

  const z = standardizedLogits(layerProbs);
  const zFinal = standardizedLogits(finalProbs.map((p) => [p])).map((r) => r[0]);

  // 層方向にならしてから、後半ほど最終確率へ寄せる
  const smoothed = z.map((row, i) => {
    const s = movingAverage(row, SMOOTH_WINDOW);
    return s.map((v, t) => {
      const w = Math.min(1, Math.max(0, (t - (T - 1) / 2) / ((T - 1) / 2 || 1))) ** 2;
      return (1 - w) * v + w * zFinal[i];
    });
  });

  // 速度として積み上げる。位置を直接いじらないので馬は後ろに戻らない
  const cumulative = smoothed.map((row) => {
    const out: number[] = [];
    let acc = 0;
    for (const v of row) {
      acc += Math.max(MIN_SPEED, 1 + SPEED_GAIN * v);
      out.push(acc);
    }
    return out;
  });

  const finish = finishPositions(finalProbs, distance);
  const positions = cumulative.map((row, i) => {
    const total = row[row.length - 1] || 1;
    return row.map((a) => (a / total) * finish[i]);
  });

  return { positions, finish, distance, smoothed };
}

/**
 * 任意の時点（0..1）での位置。層と層のあいだは線形に補間する。
 * 描画は 60fps なので、層の数だけではカクつく。
 */
export function positionAt(positions: number[], progress: number): number {
  const T = positions.length;
  if (T === 0) return 0;
  const x = Math.min(Math.max(progress, 0), 1) * (T - 1);
  const i = Math.floor(x);
  if (i >= T - 1) return positions[T - 1];
  return positions[i] + (positions[i + 1] - positions[i]) * (x - i);
}

/** その時点での順位（0 が先頭）。同着は番号の若い順 */
export function ranksAt(positions: number[][], progress: number): number[] {
  const xs = positions.map((p) => positionAt(p, progress));
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => b.x - a.x || a.i - b.i);
  const rank = new Array<number>(xs.length).fill(0);
  order.forEach((o, r) => (rank[o.i] = r));
  return rank;
}
