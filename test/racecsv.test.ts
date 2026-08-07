import { describe, expect, it } from 'vitest';
import { parseCsv, parseRacesCsv } from '../src/lib/racecsv';

/** 8頭ぶんの行を作る（複勝が成立する最少頭数） */
const rows = (raceId: string, n = 8, layers = 3) =>
  Array.from({ length: n }, (_, i) =>
    [
      raceId,
      `第1R テスト`,
      '今日は',
      'llm-jp-3-1.8b',
      `語${i}`,
      (0.3 / (i + 1)).toFixed(4),
      '',
      '',
      ...Array.from({ length: layers }, () => (0.1 * (i + 1)).toFixed(3)),
    ].join(',')
  ).join('\n');

const header = (layers = 3) =>
  ['race_id', 'race_name', 'prompt', 'model', 'word', 'final_prob', 'odds_mean', 'odds_var']
    .concat(Array.from({ length: layers }, (_, i) => `layer_${i + 1}`))
    .join(',');

const csv = (body: string, layers = 3) => `${header(layers)}\n${body}`;

describe('CSV パーサ', () => {
  it('引用符の中のカンマを通す', () => {
    expect(parseCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
  });

  it('二重引用符をエスケープとして扱う', () => {
    expect(parseCsv('a,"b""c"')).toEqual([['a', 'b"c']]);
  });

  it('引用符の中の改行を通す', () => {
    expect(parseCsv('a,"b\nc"\nd,e')).toEqual([['a', 'b\nc'], ['d', 'e']]);
  });

  it('CRLF と BOM を落とす', () => {
    expect(parseCsv('﻿a,b\r\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('空行を捨てる', () => {
    expect(parseCsv('a,b\n\n\nc,d')).toHaveLength(2);
  });
});

describe('レースの読み取り', () => {
  it('1レースを読める', () => {
    const { races, warnings } = parseRacesCsv(csv(rows('R1')), 1);
    expect(warnings).toEqual([]);
    expect(races).toHaveLength(1);
    expect(races[0].entries).toHaveLength(8);
    expect(races[0].entries[0].word).toBe('語0');
    expect(races[0].prompt).toBe('今日は');
    expect(races[0].entries[0].layerProbs).toHaveLength(3);
  });

  it('複数レースを race_id で分ける', () => {
    const { races } = parseRacesCsv(csv(`${rows('R1')}\n${rows('R2')}`), 1);
    expect(races.map((r) => r.id)).toEqual(['R1', 'R2']);
  });

  it('レースごとに違うシードが振られる（オッズが同じにならない）', () => {
    const { races } = parseRacesCsv(csv(`${rows('R1')}\n${rows('R2')}`), 1);
    expect(races[0].seed).not.toBe(races[1].seed);
  });

  it('同じ seedBase なら同じシードになる（取り込み直しても値が変わらない）', () => {
    const a = parseRacesCsv(csv(rows('R1')), 999).races[0].seed;
    const b = parseRacesCsv(csv(rows('R1')), 999).races[0].seed;
    expect(a).toBe(b);
  });

  it('列の順序が違っても読める', () => {
    const text = 'word,final_prob,race_id,layer_1,layer_2,layer_3\n' +
      Array.from({ length: 8 }, (_, i) => `語${i},0.1,R9,0.2,0.3,0.4`).join('\n');
    const { races } = parseRacesCsv(text, 1);
    expect(races[0].entries[0].layerProbs).toEqual([0.2, 0.3, 0.4]);
  });

  it('layer_ の列は番号順に並べ替える（10 が 2 の前に来ない）', () => {
    const text = 'race_id,word,final_prob,layer_10,layer_2,layer_1\n' +
      Array.from({ length: 8 }, (_, i) => `R1,語${i},0.1,0.9,0.5,0.1`).join('\n');
    const { races } = parseRacesCsv(text, 1);
    expect(races[0].entries[0].layerProbs).toEqual([0.1, 0.5, 0.9]);
  });

  it('odds_mean が空なら確率から初期値を作る', () => {
    const { races } = parseRacesCsv(csv(rows('R1')), 1);
    const e = races[0].entries[0];
    expect(e.oddsMean).toBeCloseTo(0.8 / 0.3, 1);
    expect(e.oddsVar).toBeGreaterThan(0);
  });

  it('odds_mean があればそちらを使う', () => {
    const text = 'race_id,word,final_prob,odds_mean,odds_var,layer_1\n' +
      Array.from({ length: 8 }, (_, i) => `R1,語${i},0.1,7.5,1.44,0.2`).join('\n');
    const { races } = parseRacesCsv(text, 1);
    expect(races[0].entries[0].oddsMean).toBe(7.5);
    expect(races[0].entries[0].oddsVar).toBe(1.44);
  });

  it('層の数がそろっていなければ短いほうに合わせる', () => {
    const text = 'race_id,word,final_prob,layer_1,layer_2,layer_3\n' +
      Array.from({ length: 8 }, (_, i) => `R1,語${i},0.1,0.2,0.3,${i === 0 ? '' : '0.4'}`).join('\n');
    const { races } = parseRacesCsv(text, 1);
    for (const e of races[0].entries) expect(e.layerProbs).toHaveLength(3);
  });

  it('頭数が足りないレースは落とす（複勝が成立しない）', () => {
    const { races, warnings } = parseRacesCsv(csv(rows('R1', 5)), 1);
    expect(races).toHaveLength(0);
    expect(warnings.join()).toContain('5 頭');
  });

  it('18頭を超えるレースも落とす', () => {
    const { races } = parseRacesCsv(csv(rows('R1', 19)), 1);
    expect(races).toHaveLength(0);
  });

  it('壊れた行だけ飛ばして残りは取り込む', () => {
    const broken = `${rows('R1')}\nR1,,,,,,,\n${rows('R2')}`;
    const { races, warnings } = parseRacesCsv(csv(broken), 1);
    expect(races).toHaveLength(2);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('必須の列が無ければ何も取り込まない', () => {
    const { races, warnings } = parseRacesCsv('word,final_prob\nあ,0.5', 1);
    expect(races).toEqual([]);
    expect(warnings.join()).toContain('race_id');
  });

  it('layer_ の列が無くても取り込む（警告を出す）', () => {
    const text = 'race_id,word,final_prob\n' + Array.from({ length: 8 }, (_, i) => `R1,語${i},0.1`).join('\n');
    const { races, warnings } = parseRacesCsv(text, 1);
    expect(races).toHaveLength(1);
    expect(warnings.join()).toContain('layer_1');
  });

  it('空のファイルでも落ちない', () => {
    expect(parseRacesCsv('', 1).races).toEqual([]);
  });
});
