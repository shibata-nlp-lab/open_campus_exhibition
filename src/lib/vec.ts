/** 埋め込みベクトルの可視化用ユーティリティ */

function sub(a: number[], b: number[]) {
  return a.map((v, i) => v - b[i]);
}
function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function norm(a: number[]) {
  return Math.sqrt(dot(a, a)) || 1;
}

/** べき乗法で第1・第2主成分に射影して 2D 座標を返す */
export function pca2(vectors: number[][]): Array<[number, number]> {
  const n = vectors.length;
  if (n === 0) return [];
  const dim = vectors[0].length;
  const mean = new Array(dim).fill(0);
  for (const v of vectors) for (let i = 0; i < dim; i++) mean[i] += v[i] / n;
  const X = vectors.map((v) => sub(v, mean));

  const power = (deflate: number[][] | null): number[] => {
    let w = new Array(dim).fill(0).map((_, i) => Math.sin(i * 12.9898) * 43758.5453 % 1);
    for (let iter = 0; iter < 60; iter++) {
      const next = new Array(dim).fill(0);
      for (const x of X) {
        const c = dot(x, w);
        for (let i = 0; i < dim; i++) next[i] += c * x[i];
      }
      if (deflate) {
        for (const d of deflate) {
          const c = dot(next, d);
          for (let i = 0; i < dim; i++) next[i] -= c * d[i];
        }
      }
      const nn = norm(next);
      w = next.map((v) => v / nn);
    }
    return w;
  };

  const p1 = power(null);
  const p2 = power([p1]);
  return X.map((x) => [dot(x, p1), dot(x, p2)] as [number, number]);
}

export function cosine(a: number[], b: number[]) {
  return dot(a, b) / (norm(a) * norm(b));
}

/** API が使えないときの決定的な疑似ベクトル（デモ継続用） */
export function pseudoEmbed(text: string, dim = 64): number[] {
  const v = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    for (let d = 0; d < dim; d++) {
      v[d] += Math.sin((code * (d + 1) * 0.017) + i * 0.31 + d * 0.11);
    }
  }
  const n = norm(v);
  return v.map((x) => x / n);
}

/** -1..1 の値を青→白→赤のヒートマップ色に */
export function heatColor(x: number) {
  const t = Math.max(-1, Math.min(1, x * 3));
  if (t >= 0) {
    const p = t;
    return `rgb(${255}, ${Math.round(255 - 120 * p)}, ${Math.round(255 - 200 * p)})`;
  }
  const p = -t;
  return `rgb(${Math.round(255 - 200 * p)}, ${Math.round(255 - 90 * p)}, 255)`;
}

/** トークンごとの識別色 */
export function tokenColor(i: number) {
  const hues = [200, 150, 275, 25, 330, 95, 245, 55];
  return `hsl(${hues[i % hues.length]} 70% 62% / .22)`;
}
export function tokenBorder(i: number) {
  const hues = [200, 150, 275, 25, 330, 95, 245, 55];
  return `hsl(${hues[i % hues.length]} 70% 62% / .8)`;
}
