import { describe, expect, it } from 'vitest';
import type { ResultRecord } from '../src/types';
import { BOM, resultsToCsv } from '../electron/csv';

const row = (over: Partial<ResultRecord> = {}): ResultRecord => ({
  ts: '2026-08-07T01:00:00.000Z',
  scenarioId: 's1',
  contentId: 'c1',
  kind: 'quiz',
  payload: { question: 'Q', choice: 'A', correct: true },
  ...over,
});

/**
 * テスト用の最小 CSV パーサ。
 * 値の中に `","` が現れる（JSON の `"",""` など）ので、素朴な split では分解できない。
 */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

describe('resultsToCsv', () => {
  it('BOM とヘッダから始まる（Excel で文字化けしないため）', () => {
    const csv = resultsToCsv([row()]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.slice(BOM.length).split('\n')[0]).toBe('ts,kind,scenarioId,contentId,payload');
  });

  it('列の順は ts,kind,scenarioId,contentId,payload', () => {
    const line = resultsToCsv([row()]).split('\n')[1];
    const c = cells(line);
    expect(c[0]).toBe('2026-08-07T01:00:00.000Z');
    expect(c[1]).toBe('quiz');
    expect(c[2]).toBe('s1');
    expect(c[3]).toBe('c1');
    expect(JSON.parse(c[4])).toEqual({ question: 'Q', choice: 'A', correct: true });
  });

  it('payload 内の " を倍化してエスケープする', () => {
    const line = resultsToCsv([row({ payload: { question: '「"はし"」ってどっち？' } })]).split('\n')[1];
    // 生の文字列としては "" が現れ、パースすると元に戻る
    expect(line).toContain('""');
    expect(JSON.parse(cells(line)[4])).toEqual({ question: '「"はし"」ってどっち？' });
  });

  it('カンマや改行を含む値でも列がずれない', () => {
    const line = resultsToCsv([row({ payload: { memo: 'あ,い\nう' } })]).split('\n').slice(1).join('\n');
    // JSON 化の時点で改行は \n にエスケープされるので、CSV としては 1 行のまま
    expect(line.split('\n')).toHaveLength(1);
    expect(cells(line)).toHaveLength(5);
  });

  it('scenarioId が null なら空文字になる', () => {
    expect(cells(resultsToCsv([row({ scenarioId: null })]).split('\n')[1])[2]).toBe('');
  });

  it('0 件ならヘッダだけ', () => {
    expect(resultsToCsv([])).toBe(BOM + 'ts,kind,scenarioId,contentId,payload\n');
  });

  it('件数ぶんの行が出る', () => {
    const csv = resultsToCsv([row(), row({ kind: 'game' }), row({ kind: 'attribute' })]);
    expect(csv.trimEnd().split('\n')).toHaveLength(4); // ヘッダ + 3
  });
});
