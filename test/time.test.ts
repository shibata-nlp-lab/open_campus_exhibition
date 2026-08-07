import { describe, expect, it } from 'vitest';
import { minutesUntil } from '../src/lib/time';

const at = (h: number, m: number) => new Date(2026, 7, 7, h, m, 0, 0);

describe('minutesUntil', () => {
  it('残り分数を返す', () => {
    expect(minutesUntil('14:30', at(14, 0))).toBe(30);
  });

  it('時刻を過ぎていたら null（「あと -5 分」と出さない）', () => {
    expect(minutesUntil('13:00', at(14, 0))).toBeNull();
  });

  it('ちょうどの時刻は 0 分', () => {
    expect(minutesUntil('14:00', at(14, 0))).toBe(0);
  });

  it('前後の空白は無視する', () => {
    expect(minutesUntil(' 14:30 ', at(14, 0))).toBe(30);
  });

  it('1桁の時も受ける', () => {
    expect(minutesUntil('9:05', at(9, 0))).toBe(5);
  });

  it.each(['', '未定', '1430', '14:5', '25:00-', 'あ:い'])('不正な形式 %o は null', (bad) => {
    expect(minutesUntil(bad, at(14, 0))).toBeNull();
  });

  it('秒は切り上げ・切り捨てされて分に丸まる', () => {
    const now = new Date(2026, 7, 7, 14, 0, 40);
    // 14:30 まで 29分20秒 → 29分
    expect(minutesUntil('14:30', now)).toBe(29);
  });
});
