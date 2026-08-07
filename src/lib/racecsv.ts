/**
 * Colab のノートブックが書き出した races.csv を読む。
 *
 * 1行が「あるレースのある語」。列の順序は問わず、`layer_` で始まる列を
 * 層番号の昇順に並べて途中経過にする。形式は
 * [docs/betting-mode.md](../../docs/betting-mode.md) を参照。
 */
import type { BettingEntry, BettingRace } from '../types';
import { MAX_ENTRIES, MIN_ENTRIES } from './odds';

/** RFC4180 相当の1行パーサ。引用符の中の , と改行を通す */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const num = (v: string | undefined, fallback = 0) => {
  const x = Number(String(v ?? '').trim());
  return Number.isFinite(x) ? x : fallback;
};

export interface CsvResult {
  races: BettingRace[];
  /** 読み飛ばした行の理由。取り込み後に画面へ出す */
  warnings: string[];
}

/**
 * CSV をレースの配列に変換する。
 *
 * 壊れた行があっても**そこだけ飛ばして残りは取り込む**（1レースのせいで全部落とさない）。
 * 頭数が範囲外のレースは、券種が成立しないので丸ごと落とす。
 */
export function parseRacesCsv(text: string, seedBase = Date.now()): CsvResult {
  const rows = parseCsv(text);
  const warnings: string[] = [];
  if (rows.length < 2) return { races: [], warnings: ['ヘッダと1行以上のデータが必要です。'] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const at = (name: string) => header.indexOf(name);
  const need = ['race_id', 'word', 'final_prob'];
  const missing = need.filter((n) => at(n) < 0);
  if (missing.length) return { races: [], warnings: [`列が足りません：${missing.join(', ')}`] };

  // layer_1, layer_2 … を番号の昇順に並べる（列が飛んでいても順序だけ見る）
  const layerCols = header
    .map((h, i) => ({ i, m: /^layer_(\d+)$/.exec(h) }))
    .filter((x) => x.m)
    .map((x) => ({ i: x.i, n: Number(x.m![1]) }))
    .sort((a, b) => a.n - b.n)
    .map((x) => x.i);
  if (layerCols.length === 0) warnings.push('layer_1 … の列がありません。途中経過なしで取り込みます。');

  const byRace = new Map<string, { meta: string[]; entries: BettingEntry[] }>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = (row[at('race_id')] ?? '').trim();
    const word = (row[at('word')] ?? '').trim();
    if (!id || !word) {
      warnings.push(`${r + 1} 行目：race_id か word が空です。`);
      continue;
    }
    const finalProb = num(row[at('final_prob')], -1);
    if (finalProb < 0) {
      warnings.push(`${r + 1} 行目：final_prob を読めません。`);
      continue;
    }
    if (!byRace.has(id)) byRace.set(id, { meta: row, entries: [] });
    byRace.get(id)!.entries.push({
      word,
      finalProb,
      // 初期値が無ければ、控除率ぶんだけ甘い単勝オッズを確率から作る
      oddsMean: num(row[at('odds_mean')], 0) || Math.min(500, Math.max(1.1, 0.8 / Math.max(finalProb, 1e-4))),
      oddsVar: num(row[at('odds_var')], 0) || (0.18 * Math.max(1.1, 0.8 / Math.max(finalProb, 1e-4))) ** 2,
      layerProbs: layerCols.map((c) => Math.max(0, num(row[c], 0))),
    });
  }

  const races: BettingRace[] = [];
  let k = 0;
  for (const [id, { meta, entries }] of byRace) {
    if (entries.length < MIN_ENTRIES || entries.length > MAX_ENTRIES) {
      warnings.push(`${id}：${entries.length} 頭は対象外です（${MIN_ENTRIES}〜${MAX_ENTRIES} 頭）。`);
      continue;
    }
    // 層の数がそろっていないと位置計算ができないので、いちばん短いものに合わせる
    const T = Math.min(...entries.map((e) => e.layerProbs.length));
    races.push({
      id,
      name: (meta[at('race_name')] ?? '').trim() || `第${races.length + 1}R`,
      prompt: (meta[at('prompt')] ?? '').trim(),
      model: (meta[at('model')] ?? '').trim(),
      seed: (seedBase + k * 7919) >>> 0,
      entries: entries.map((e) => ({ ...e, layerProbs: e.layerProbs.slice(0, T) })),
    });
    k++;
  }

  if (races.length === 0 && warnings.length === 0) warnings.push('取り込めるレースがありませんでした。');
  return { races, warnings };
}
