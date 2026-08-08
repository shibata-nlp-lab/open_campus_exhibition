import { describe, expect, it } from 'vitest';
import { findBranchTarget } from '../src/lib/branch';

/** 説明のあとに分岐を置いた、いちばん普通の並び */
const usual = ['opening', 'exp1', 'slide', 'branch'];

describe('findBranchTarget', () => {
  it('分岐より前にある体験のステップ番号を返す', () => {
    expect(findBranchTarget(usual, 3, 'exp1')).toBe(1);
  });

  it('同じ体験が2か所にあるときは、直前に見せたほうへ帰す', () => {
    const steps = ['exp1', 'slide', 'exp1', 'slide2', 'branch'];
    expect(findBranchTarget(steps, 4, 'exp1')).toBe(2);
  });

  it('分岐より後ろにしか無くても見つける（並べ替え直後を想定）', () => {
    expect(findBranchTarget(['branch', 'exp1'], 0, 'exp1')).toBe(1);
  });

  it('シナリオに入っていないコンテンツなら -1（戻るボタンを出さない）', () => {
    expect(findBranchTarget(usual, 3, 'exp2')).toBe(-1);
  });

  it('戻り先が未設定なら -1', () => {
    expect(findBranchTarget(usual, 3, null)).toBe(-1);
    expect(findBranchTarget(usual, 3, '')).toBe(-1);
    expect(findBranchTarget(usual, 3, undefined)).toBe(-1);
  });

  it('自分自身へは戻さない（抜けられなくなるため）', () => {
    expect(findBranchTarget(['branch'], 0, 'branch')).toBe(-1);
  });

  it('同じ分岐が2つ置かれていても、前にあるほうへは戻せる', () => {
    // 「戻り先＝分岐」という設定は普通しないが、前方に別の同IDがあるなら
    // それは自分自身ではないので有効な戻り先になる
    expect(findBranchTarget(['branch', 'slide', 'branch'], 2, 'branch')).toBe(0);
  });

  it('空のシナリオでも落ちない', () => {
    expect(findBranchTarget([], 0, 'exp1')).toBe(-1);
  });

  it('fromIndex が範囲外でも落ちない', () => {
    expect(findBranchTarget(usual, 99, 'exp1')).toBe(1);
    expect(findBranchTarget(usual, -1, 'exp1')).toBe(1);
  });
});
