/**
 * safetensors から必要なテンソルだけを取り出すための最小限の処理。
 *
 * ファイル構造:
 *   [0..7]                     ヘッダの長さ（u64 LE）
 *   [8..8+headerLen]           JSON ヘッダ（テンソル名 → dtype / shape / data_offsets）
 *   [8+headerLen..]            テンソル本体が連結されたもの
 *
 * data_offsets は「本体の先頭からの相対位置」なので、
 * 絶対位置は 8 + headerLen + offset になる。ここを間違えると
 * 読めてはいるが中身がずれた行を返し、それらしい結果が出てしまうので注意。
 */

export interface TensorInfo {
  dtype: string;
  shape: number[];
  data_offsets: [number, number];
}

export interface TensorRange {
  /** ファイル先頭からのバイト位置（この範囲だけ取得すればよい） */
  start: number;
  /** 終端の次のバイト位置 */
  end: number;
  shape: number[];
  dtype: string;
}

export const readHeaderLength = (head8: Buffer): number => Number(head8.readBigUInt64LE(0));

/** ヘッダ JSON と headerLen から、目的のテンソルの絶対バイト範囲を求める */
export function tensorRange(header: Record<string, unknown>, name: string, headerLen: number): TensorRange {
  const info = header[name] as TensorInfo | undefined;
  if (!info || !Array.isArray(info.data_offsets)) {
    throw new Error(`safetensors に ${name} が見つかりません`);
  }
  const base = 8 + headerLen;
  return {
    start: base + info.data_offsets[0],
    end: base + info.data_offsets[1],
    shape: info.shape,
    dtype: info.dtype,
  };
}

/**
 * bfloat16 → float32。
 * bf16 は f32 の上位 16bit をそのまま切り落としたものなので、下位 16bit を 0 で埋めれば戻る。
 */
export function bf16ToFloat32(bits: number): number {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, (bits << 16) >>> 0, true);
  return new DataView(buf).getFloat32(0, true);
}

/** bf16 で詰められた 1 行（dim 個）を float32 配列にする */
export function decodeBf16Row(buf: Buffer, dim: number): Float32Array {
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) out[i] = bf16ToFloat32(buf.readUInt16LE(i * 2));
  return out;
}
