/**
 * 馬券風モードのオッズ計算。
 *
 * 流れは実際の馬券市場と同じ向きで、
 *   語ごとの「オッズ平均・分散」→ 単勝オッズ → 市場の推定勝率 → 各券種の的中確率 → オッズ
 * と進む。設計の意図は [docs/betting-mode.md](../../docs/betting-mode.md) を参照。
 *
 * DOM も Electron も要らない純粋関数だけを置く（テストから直接呼べる）。
 */

export type BetKind =
  | 'win' // 単勝
  | 'place' // 複勝
  | 'bracket' // 枠連
  | 'quinella' // 馬連
  | 'wide' // ワイド
  | 'exacta' // 馬単
  | 'trio' // 3連複
  | 'trifecta'; // 3連単

export const BET_LABELS: Record<BetKind, string> = {
  win: '単勝',
  place: '複勝',
  bracket: '枠連',
  quinella: '馬連',
  wide: 'ワイド',
  exacta: '馬単',
  trio: '3連複',
  trifecta: '3連単',
};

/** 券種ごとの控除率。JRA の実際の値に合わせてある */
export const PAYOUT_RATE: Record<BetKind, number> = {
  win: 0.8,
  place: 0.8,
  bracket: 0.775,
  quinella: 0.775,
  wide: 0.775,
  exacta: 0.775,
  trio: 0.775,
  trifecta: 0.725,
};

/** 何頭を選ぶ券種か */
export const BET_PICKS: Record<BetKind, number> = {
  win: 1,
  place: 1,
  bracket: 2,
  quinella: 2,
  wide: 2,
  exacta: 2,
  trio: 3,
  trifecta: 3,
};

/** 着順どおりに選ぶ券種（順序が意味を持つ） */
export const BET_ORDERED: Record<BetKind, boolean> = {
  win: false,
  place: false,
  bracket: false,
  quinella: false,
  wide: false,
  exacta: true,
  trio: false,
  trifecta: true,
};

/** 複勝・ワイド・3連系が成立する最少頭数（3着まで数えるため） */
export const MIN_ENTRIES = 8;
export const MAX_ENTRIES = 18;

/* ---------------- 乱数 ---------------- */

/**
 * シード付き乱数（mulberry32）。
 * 同じシードなら必ず同じオッズになるので、展示中に画面を作り直しても値が変わらない。
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 標準正規乱数（Box-Muller）。u が 0 だと発散するので下限を入れる */
export function randn(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/**
 * 平均と分散を指定して対数正規分布から引く（モーメントマッチング）。
 * 正の値しか出ないので、オッズの分布として素直。
 */
export function lognormal(mean: number, variance: number, rng: () => number): number {
  const m = Math.max(mean, 1e-6);
  const v = Math.max(variance, 0);
  const sigma2 = Math.log(1 + v / (m * m));
  const mu = Math.log(m) - sigma2 / 2;
  return Math.exp(mu + Math.sqrt(sigma2) * randn(rng));
}

/* ---------------- オッズの丸め ---------------- */

/** 実際の馬券に合わせた丸め。10倍未満は0.1刻み、100倍未満は1刻み、それ以上は10刻み */
export function roundOdds(x: number): number {
  const v = Math.min(Math.max(x, 1), 9999.9);
  const r = v < 10 ? Math.round(v * 10) / 10 : v < 100 ? Math.round(v) : Math.round(v / 10) * 10;
  // 丸めで上限を超えることがある（9999.9 → 10000）ので、最後にもう一度抑える
  return Math.min(r, 9999.9);
}

/* ---------------- 枠 ---------------- */

/**
 * 頭数に応じた枠番（1..8）。JRA と同じく、8頭以下は 1頭 1枠、
 * 9頭以上は 8枠に均等割りして、余りは**大きい枠から**足していく
 * （例：9頭 → 8枠だけ2頭、18頭 → 7・8枠が3頭）。
 */
export function bracketOf(index: number, count: number): number {
  if (count <= 8) return index + 1;
  const base = Math.floor(count / 8);
  const rem = count % 8; // 1頭多く入る枠の数（大きい枠側）
  const small = 8 - rem; // base 頭だけの枠の数
  if (index < small * base) return Math.floor(index / base) + 1;
  return small + Math.floor((index - small * base) / (base + 1)) + 1;
}

/** 各出走の枠番 */
export const brackets = (count: number): number[] =>
  Array.from({ length: count }, (_, i) => bracketOf(i, count));

/* ---------------- 単勝オッズ ---------------- */

export interface OddsInput {
  oddsMean: number;
  oddsVar: number;
}

/** 語ごとの平均・分散から単勝オッズを引く */
export function winOdds(entries: OddsInput[], rng: () => number): number[] {
  return entries.map((e) => roundOdds(lognormal(e.oddsMean, e.oddsVar, rng)));
}

/**
 * 単勝オッズから市場の推定勝率に戻す。
 * 控除率を戻したうえで合計 1 に正規化する。真の確率とは少しズレていて、
 * その差が「人気と実力の食い違い」としてゲーム性になる。
 */
export function impliedProbs(odds: number[]): number[] {
  const raw = odds.map((o) => PAYOUT_RATE.win / Math.max(o, 1));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((x) => x / sum);
}

/* ---------------- 的中確率（Harville） ---------------- */

/** 券種ごとの的中確率。キーの作り方は betKey() を参照 */
export type ProbTable = Record<BetKind, Map<string, number>>;

const emptyTable = (): ProbTable => ({
  win: new Map(),
  place: new Map(),
  bracket: new Map(),
  quinella: new Map(),
  wide: new Map(),
  exacta: new Map(),
  trio: new Map(),
  trifecta: new Map(),
});

const add = (m: Map<string, number>, key: string, v: number) => m.set(key, (m.get(key) ?? 0) + v);

/**
 * 券種と選んだ馬（0始まりの番号）から一意なキーを作る。
 * 順不同の券種は昇順に並べ替えるので、選んだ順番によらず同じキーになる。
 */
export function betKey(kind: BetKind, picks: number[]): string {
  const p = BET_ORDERED[kind] ? picks.slice() : picks.slice().sort((a, b) => a - b);
  return p.join('-');
}

/**
 * Harville モデルで全券種の的中確率をまとめて出す。
 *
 * 1〜3着の順列を全部たどって、通ったぶんだけ各券種に足し込む。
 * 18頭でも 18×17×16 = 4,896 通りなので全列挙して構わない。
 * この作り方だと「どの券種も同じ着順分布から出ている」ことが自明になる。
 */
export function hitProbabilities(p: number[]): ProbTable {
  const n = p.length;
  const table = emptyTable();
  const frame = brackets(n);

  for (let i = 0; i < n; i++) {
    add(table.win, betKey('win', [i]), p[i]);
    const rest1 = 1 - p[i];
    if (rest1 <= 0) continue;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const p2 = (p[i] * p[j]) / rest1;
      add(table.exacta, betKey('exacta', [i, j]), p2);
      add(table.quinella, betKey('quinella', [i, j]), p2);
      add(table.bracket, betKey('bracket', [frame[i], frame[j]]), p2);
      const rest2 = 1 - p[i] - p[j];
      if (rest2 <= 0) continue;
      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        const p3 = (p2 * p[k]) / rest2;
        add(table.trifecta, betKey('trifecta', [i, j, k]), p3);
        add(table.trio, betKey('trio', [i, j, k]), p3);
        // 複勝は3着以内、ワイドは2頭とも3着以内
        add(table.place, betKey('place', [i]), p3);
        add(table.place, betKey('place', [j]), p3);
        add(table.place, betKey('place', [k]), p3);
        add(table.wide, betKey('wide', [i, j]), p3);
        add(table.wide, betKey('wide', [i, k]), p3);
        add(table.wide, betKey('wide', [j, k]), p3);
      }
    }
  }
  return table;
}

/* ---------------- 全券種のオッズ ---------------- */

export type OddsTable = Record<BetKind, Map<string, number>>;

/** 券種ごとに掛けるゆらぎの大きさ（対数正規の σ）。単勝から機械的に決まらないようにする */
const NOISE_SIGMA = 0.1;

/**
 * 的中確率から券種ごとのオッズを作る。
 *
 * オッズ = 控除率 / (的中確率 × ゆらぎ)。
 * 単勝だけは引いた値がそのまま人気の根拠なので、ゆらぎを掛けずに渡された値を使う。
 */
export function buildOdds(hits: ProbTable, win: number[], rng: () => number): OddsTable {
  const out: OddsTable = emptyTable();
  out.win = new Map(win.map((o, i) => [betKey('win', [i]), o]));

  for (const kind of Object.keys(hits) as BetKind[]) {
    if (kind === 'win') continue;
    // キー順を固定しないと、同じシードでも実行のたびに値が変わってしまう
    const keys = [...hits[kind].keys()].sort();
    for (const key of keys) {
      const p = hits[kind].get(key)!;
      const noise = Math.exp(NOISE_SIGMA * randn(rng));
      out[kind].set(key, roundOdds(p > 0 ? PAYOUT_RATE[kind] / (p * noise) : 9999.9));
    }
  }
  return out;
}

/** 1レースぶんのオッズを作る（単勝を引いてから他券種を導く） */
export function raceOdds(entries: OddsInput[], seed: number): { win: number[]; odds: OddsTable } {
  const rng = makeRng(seed);
  const win = winOdds(entries, rng);
  const hits = hitProbabilities(impliedProbs(win));
  return { win, odds: buildOdds(hits, win, rng) };
}

/* ---------------- 着順と払戻 ---------------- */

/**
 * 着順。最終出力確率の降順で、同じなら番号の若い順。
 * ここが「正解」で、レースの見せ方が何であれ着順はこれになる。
 */
export function finishOrder(finalProbs: number[]): number[] {
  return finalProbs
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map((x) => x.i);
}

/** 着順から、その券種で的中となるキーを列挙する */
export function winningKeys(kind: BetKind, order: number[], count: number): string[] {
  const [a, b, c] = order;
  const frame = brackets(count);
  switch (kind) {
    case 'win':
      return [betKey('win', [a])];
    case 'place':
      return [a, b, c].filter((x) => x !== undefined).map((x) => betKey('place', [x]));
    case 'exacta':
      return [betKey('exacta', [a, b])];
    case 'quinella':
      return [betKey('quinella', [a, b])];
    case 'bracket':
      return [betKey('bracket', [frame[a], frame[b]])];
    case 'wide':
      return c === undefined
        ? [betKey('wide', [a, b])]
        : [betKey('wide', [a, b]), betKey('wide', [a, c]), betKey('wide', [b, c])];
    case 'trifecta':
      return [betKey('trifecta', [a, b, c])];
    case 'trio':
      return [betKey('trio', [a, b, c])];
  }
}

export interface Bet {
  kind: BetKind;
  /** 0始まりの馬番。枠連だけは枠番（1..8） */
  picks: number[];
  /** 円 */
  amount: number;
}

/** 1点ぶんの払戻（外れたら 0）。100円単位ではなく、賭けた額 × オッズで計算する */
export function payout(bet: Bet, odds: OddsTable, order: number[], count: number): number {
  const key = betKey(bet.kind, bet.picks);
  if (!winningKeys(bet.kind, order, count).includes(key)) return 0;
  const o = odds[bet.kind].get(key);
  return o ? Math.floor(bet.amount * o) : 0;
}
