/**
 * llm-jp の「埋め込み層」をそのまま使う。
 *
 * Ruri や OpenAI は文を読んで意味ベクトルを作るモデルだが、こちらは
 * LLM がトークンIDを最初にベクトルへ変換する表（model.embed_tokens.weight）そのもの。
 * 進行画面に出しているトークンIDが、そのまま表の行番号になる。
 *
 * モデル全体（1.8b なら 3.7GB）は要らないので、safetensors のヘッダを読んで
 * 埋め込み層のバイト範囲だけを HTTP Range で取得する。
 * 取得したスライスはそのまま置いておき、行 = ID の位置から必要な分だけ読む
 * （量子化も前処理もしない。1行 = dim × 2バイト）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { userDir } from './config';
import { bf16ToFloat32, readHeaderLength, tensorRange } from './safetensors';
import { meanPool } from './vectorPool';

export type LlmJpSize = '150m' | '440m' | '1.8b';

/** llm-jp-3 系はどのサイズも語彙 99,584（うち 99,574 が実トークン、残りは詰め物） */
const ROWS = 99584;
const TENSOR = 'model.embed_tokens.weight';

export const LLMJP_MODELS: Record<LlmJpSize, { repo: string; dim: number; label: string; mb: number }> = {
  '150m': { repo: 'llm-jp/llm-jp-3-150m', dim: 512, label: 'llm-jp-3-150m（軽量・類義語向き）', mb: 97 },
  '440m': { repo: 'llm-jp/llm-jp-3-440m', dim: 1024, label: 'llm-jp-3-440m（中間）', mb: 195 },
  '1.8b': { repo: 'llm-jp/llm-jp-3-1.8b', dim: 2048, label: 'llm-jp-3-1.8b（高次元・表記ゆれが出やすい）', mb: 389 },
};

const modelUrl = (size: LlmJpSize) => `https://huggingface.co/${LLMJP_MODELS[size].repo}/resolve/main/model.safetensors`;

export const llmjpDir = () => path.join(userDir(), 'models', 'llm-jp');
const slicePath = (size: LlmJpSize) => path.join(llmjpDir(), `llm-jp-3-${size}-embed.bin`);

/** 期待されるスライスのバイト数。ダウンロードの完了判定にも使う */
const expectedBytes = (size: LlmJpSize) => ROWS * LLMJP_MODELS[size].dim * 2;

export function isLlmJpReady(size: LlmJpSize): boolean {
  try {
    return fs.statSync(slicePath(size)).size === expectedBytes(size);
  } catch {
    return false;
  }
}

async function range(url: string, from: number, to: number): Promise<Buffer> {
  const res = await fetch(url, { headers: { Range: `bytes=${from}-${to}` } });
  // 206 以外だと Range が無視されている＝ファイル全体（数GB）が流れてくる恐れがある
  if (res.status !== 206) {
    throw new Error(
      `この回線では部分ダウンロードが使えません（HTTP ${res.status}）。` +
        'プロキシを介さないネットワークで事前ダウンロードしてください。'
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

/** 埋め込み層だけをダウンロードする（展示当日に待たないよう設定画面から先に叩く） */
export async function prepareLlmJpEmbed(size: LlmJpSize): Promise<{ ready: boolean }> {
  if (isLlmJpReady(size)) return { ready: true };
  const url = modelUrl(size);

  const headerLen = readHeaderLength(await range(url, 0, 7));
  const header = JSON.parse((await range(url, 8, headerLen + 7)).toString('utf-8'));
  const t = tensorRange(header, TENSOR, headerLen);

  if (t.dtype !== 'BF16') throw new Error(`想定外の dtype: ${t.dtype}`);
  if (t.shape[0] !== ROWS || t.shape[1] !== LLMJP_MODELS[size].dim) {
    throw new Error(`想定外の形: ${JSON.stringify(t.shape)}`);
  }

  fs.mkdirSync(llmjpDir(), { recursive: true });
  const tmp = slicePath(size) + '.tmp';
  fs.writeFileSync(tmp, await range(url, t.start, t.end - 1));
  // 途中で切れたファイルを「取得済み」と誤認しないよう、サイズを確認してから置き換える
  if (fs.statSync(tmp).size !== expectedBytes(size)) {
    fs.rmSync(tmp, { force: true });
    throw new Error('ダウンロードが途中で終わりました。もう一度お試しください。');
  }
  fs.renameSync(tmp, slicePath(size));
  return { ready: true };
}

/** 開いたままにしておく（語彙プールの取得では数万行を読む） */
const handles = new Map<LlmJpSize, number>();

function fd(size: LlmJpSize): number {
  let h = handles.get(size);
  if (h === undefined) {
    if (!isLlmJpReady(size)) {
      throw new Error(`${LLMJP_MODELS[size].label} が未取得です。設定画面からダウンロードしてください。`);
    }
    h = fs.openSync(slicePath(size), 'r');
    handles.set(size, h);
  }
  return h;
}

/**
 * トークンIDの並びを 1 本のベクトルにする。
 *
 * @param groups 語ごとのトークンID列。分割はレンダラ側（同じ llm-jp のトークナイザ）で行う
 */
export function embedLlmJpIds(groups: number[][], size: LlmJpSize): number[][] {
  const { dim } = LLMJP_MODELS[size];
  const h = fd(size);
  const buf = Buffer.alloc(dim * 2);
  const cache = new Map<number, Float32Array>();

  const row = (id: number): Float32Array | null => {
    if (id < 0 || id >= ROWS) return null;
    const hit = cache.get(id);
    if (hit) return hit;
    fs.readSync(h, buf, 0, dim * 2, id * dim * 2);
    const v = new Float32Array(dim);
    for (let i = 0; i < dim; i++) v[i] = bf16ToFloat32(buf.readUInt16LE(i * 2));
    cache.set(id, v);
    return v;
  };

  return groups.map((ids) => meanPool(ids.map(row).filter((v): v is Float32Array => v !== null), dim));
}
