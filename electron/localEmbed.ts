/**
 * ローカルの日本語埋め込みモデル（Ruri v3 / cl-nagoya）を Electron のメインプロセスで動かす。
 *
 * - 重みは onnx-community/ruri-v3-*-ONNX（量子化 ONNX）
 * - トークナイザは本家 cl-nagoya/ruri-v3-* （ONNX 側のリポジトリには入っていない）
 * - プーリングは mean（1_Pooling/config.json が pooling_mode_mean_tokens: true）
 * - Ruri v3 は用途別の接頭辞を前提に学習されている。意味の近さを見る用途は「トピック: 」
 *
 * モデルは初回利用時に Hugging Face からダウンロードし、userData/models に置く。
 */
import path from 'node:path';
import fs from 'node:fs';
import { userDir } from './config';

export type RuriSize = '30m' | '130m' | '310m';

export const RURI_MODELS: Record<RuriSize, { onnx: string; tokenizer: string; label: string; mb: number }> = {
  '30m': {
    onnx: 'onnx-community/ruri-v3-30m-ONNX',
    tokenizer: 'cl-nagoya/ruri-v3-30m',
    label: 'Ruri v3 30m（軽量）',
    mb: 35,
  },
  '130m': {
    onnx: 'onnx-community/ruri-v3-130m-ONNX',
    tokenizer: 'cl-nagoya/ruri-v3-130m',
    label: 'Ruri v3 130m（標準）',
    mb: 127,
  },
  '310m': {
    onnx: 'onnx-community/ruri-v3-310m-ONNX',
    tokenizer: 'cl-nagoya/ruri-v3-310m',
    label: 'Ruri v3 310m（高精度）',
    mb: 301,
  },
};

/** 意味の近さ・分類用途の接頭辞 */
const PREFIX = 'トピック: ';

export const modelsDir = () => path.join(userDir(), 'models');

interface Loaded {
  size: RuriSize;
  tokenizer: any;
  model: any;
}

let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;

/**
 * トークナイザだけを読む。
 * tokenizer.json は 7MB 弱なので、埋め込みを使わず分割だけ見せたい場合は
 * モデル本体（数十〜300MB）を落とさずに済む。
 */
const tokenizers = new Map<RuriSize, Promise<any>>();

async function getTokenizer(size: RuriSize): Promise<any> {
  let p = tokenizers.get(size);
  if (!p) {
    p = (async () => {
      const { AutoTokenizer, env } = await import('@huggingface/transformers');
      fs.mkdirSync(modelsDir(), { recursive: true });
      env.cacheDir = modelsDir();
      return AutoTokenizer.from_pretrained(RURI_MODELS[size].tokenizer);
    })().catch((e) => {
      tokenizers.delete(size); // 失敗を握り続けないでやり直せるようにする
      throw e;
    });
    tokenizers.set(size, p);
  }
  return p;
}

async function getPipeline(size: RuriSize): Promise<Loaded> {
  if (loaded?.size === size) return loaded;
  if (loading) {
    const l = await loading;
    if (l.size === size) return l;
  }
  loading = (async () => {
    const { AutoModel, env } = await import('@huggingface/transformers');
    fs.mkdirSync(modelsDir(), { recursive: true });
    env.cacheDir = modelsDir();
    const spec = RURI_MODELS[size];
    const tokenizer = await getTokenizer(size);
    const model = await AutoModel.from_pretrained(spec.onnx, { dtype: 'q8' });
    loaded = { size, tokenizer, model };
    return loaded;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

/** ダウンロード済みかどうか（キャッシュにモデル本体があるか） */
export function isModelReady(size: RuriSize): boolean {
  const spec = RURI_MODELS[size];
  const onnx = path.join(modelsDir(), ...spec.onnx.split('/'), 'onnx', 'model_quantized.onnx');
  const tok = path.join(modelsDir(), ...spec.tokenizer.split('/'), 'tokenizer.json');
  return fs.existsSync(onnx) && fs.existsSync(tok);
}

/** 事前ダウンロード（当日の待ち時間をなくすため設定画面から叩く） */
export async function prepareModel(size: RuriSize): Promise<{ ready: boolean }> {
  await getPipeline(size);
  return { ready: isModelReady(size) };
}

const BYTE_TOKEN = /^<0x([0-9A-Fa-f]{2})>$/;

/**
 * Ruri v3 が実際に使うトークナイザで分割する（進行画面の表示用）。
 *
 * SentencePiece Unigram なので `▁` が空白を表す。語彙にない文字は `<0xNN>` の
 * バイト列に落ちるので、連続するバイトトークンはまとめて文字に戻してから返す
 * （画面に `<0xE3>` と出しても展示にならないため）。
 */
export async function tokenizeRuri(text: string, size: RuriSize): Promise<Array<{ id: number; text: string }>> {
  const tokenizer = await getTokenizer(size);
  const pieces: string[] = tokenizer.tokenize(text, { add_special_tokens: false });
  const ids: number[] = tokenizer.convert_tokens_to_ids(pieces);

  const out: Array<{ id: number; text: string }> = [];
  for (let i = 0; i < pieces.length; i++) {
    const m = BYTE_TOKEN.exec(pieces[i]);
    if (!m) {
      out.push({ id: ids[i] ?? 0, text: pieces[i].replace(/▁/g, ' ') });
      continue;
    }
    // バイトトークンの連続を1文字ぶんずつ復元する
    const start = i;
    const bytes: number[] = [];
    while (i < pieces.length) {
      const b = BYTE_TOKEN.exec(pieces[i]);
      if (!b) break;
      bytes.push(parseInt(b[1], 16));
      i++;
    }
    i--;
    const decoded = new TextDecoder().decode(Uint8Array.from(bytes));
    for (let k = start; k <= i; k++) out.push({ id: ids[k] ?? 0, text: decoded });
  }

  // 先頭の空白は入力にはなかったものなので落とす
  if (out.length && out[0].text.trim() === '') out.shift();
  if (out.length) out[0] = { ...out[0], text: out[0].text.replace(/^ /, '') };
  return out;
}

export async function embedLocal(texts: string[], size: RuriSize): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { tokenizer, model } = await getPipeline(size);
  const out: number[][] = [];

  // 一度に全部入れるとパディングが最長文に引きずられて無駄が大きいので小分けにする
  const BATCH = 256;
  for (let start = 0; start < texts.length; start += BATCH) {
    const chunk = texts.slice(start, start + BATCH).map((t) => PREFIX + t);
    const inputs = await tokenizer(chunk, { padding: true, truncation: true });
    const { last_hidden_state } = await model(inputs);
    const [b, s, d] = last_hidden_state.dims as [number, number, number];
    const h = last_hidden_state.data as Float32Array;
    const mask = inputs.attention_mask.data as BigInt64Array | Int32Array;

    for (let i = 0; i < b; i++) {
      const v = new Array<number>(d).fill(0);
      let n = 0;
      for (let j = 0; j < s; j++) {
        if (!Number(mask[i * s + j])) continue; // パディングは平均に含めない
        n++;
        const base = i * s * d + j * d;
        for (let k = 0; k < d; k++) v[k] += h[base + k];
      }
      for (let k = 0; k < d; k++) v[k] /= n || 1;
      const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
      out.push(v.map((x) => x / norm));
    }
  }
  return out;
}
