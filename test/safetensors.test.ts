import { describe, expect, it } from 'vitest';
import { bf16ToFloat32, decodeBf16Row, readHeaderLength, tensorRange } from '../electron/safetensors';

describe('readHeaderLength', () => {
  it('先頭 8 バイトを u64 LE として読む', () => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(12424n, 0);
    expect(readHeaderLength(b)).toBe(12424);
  });
});

describe('tensorRange', () => {
  const header = {
    'model.embed_tokens.weight': { dtype: 'BF16', shape: [99584, 512], data_offsets: [101974016, 203948032] },
  };

  it('絶対位置は 8 + headerLen + data_offsets になる', () => {
    // ここを取り違えると、読めてはいるが中身がずれた行を返してしまう
    const r = tensorRange(header, 'model.embed_tokens.weight', 12424);
    expect(r.start).toBe(8 + 12424 + 101974016);
    expect(r.end).toBe(8 + 12424 + 203948032);
  });

  it('範囲の長さが 行数 × 次元 × 2バイト と一致する', () => {
    const r = tensorRange(header, 'model.embed_tokens.weight', 12424);
    expect(r.end - r.start).toBe(99584 * 512 * 2);
  });

  it('shape と dtype をそのまま返す', () => {
    const r = tensorRange(header, 'model.embed_tokens.weight', 0);
    expect(r.shape).toEqual([99584, 512]);
    expect(r.dtype).toBe('BF16');
  });

  it('目的のテンソルが無ければ落ちる', () => {
    expect(() => tensorRange(header, 'lm_head.weight', 0)).toThrow(/見つかりません/);
  });
});

describe('bf16ToFloat32', () => {
  it.each([
    [0x0000, 0],
    [0x3f80, 1],
    [0xbf80, -1],
    [0x4000, 2],
    [0x3f00, 0.5],
  ])('0x%s → %s', (bits, expected) => {
    expect(bf16ToFloat32(bits as number)).toBe(expected);
  });

  it('bf16 は f32 の上位16bitなので、丸めは切り捨てになる', () => {
    // 1.0 の次に表現できる bf16 は 1 + 2^-7
    expect(bf16ToFloat32(0x3f81)).toBeCloseTo(1 + 2 ** -7, 6);
  });
});

describe('decodeBf16Row', () => {
  it('1 行ぶんを float32 配列にする', () => {
    const buf = Buffer.alloc(8);
    for (const [i, bits] of [0x3f80, 0xbf80, 0x4000, 0x0000].entries()) buf.writeUInt16LE(bits, i * 2);
    expect(Array.from(decodeBf16Row(buf, 4))).toEqual([1, -1, 2, 0]);
  });

  it('指定した次元ぶんだけ読む', () => {
    expect(decodeBf16Row(Buffer.alloc(16), 8)).toHaveLength(8);
  });
});
