import type { ResultRecord } from '../src/types';

/** Excel が UTF-8 と判定できるように付ける BOM */
export const BOM = '﻿';

const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;

/**
 * 集計ログを CSV にする。
 * payload は kind ごとに形が違うので、展開せず JSON 文字列のまま1セルに入れる。
 * すべてのセルを引用符で囲み、値の中の " は "" に倍化する（改行やカンマを含んでも壊れない）。
 */
export function resultsToCsv(rows: ResultRecord[]): string {
  const header = 'ts,kind,scenarioId,contentId,payload\n';
  const body = rows
    .map((r) => [r.ts, r.kind, r.scenarioId ?? '', r.contentId, JSON.stringify(r.payload)].map(escape).join(','))
    .join('\n');
  return BOM + header + body;
}
