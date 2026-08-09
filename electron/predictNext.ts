/**
 * 日本語モデルを丸ごとこの PC で動かし、「次に来る1トークン」の確率を出す。
 *
 * 体験②はこれまで OpenAI の top_logprobs だけだった。こちらは
 * - APIキー不要・通信なし（初回のダウンロードだけ必要）
 * - 日本語のモデルなので、トークンが語のかたまりで出て高校生にも読みやすい
 * という違いがある。体験①の llm-jp（埋め込み層＝表を引くだけ）とは別物で、
 * こちらはモデル本体を forward させている。
 *
 * 先頭に BOS を付けるかどうかで分布がはっきり変わるので必ず付ける。
 *   「日本の首都は」→ 東京 57%（BOSあり） / 東京 1.9%（BOSなし）
 *
 * Qwen2 系（Qwen2.5-1.5B / TinySwallow-1.5B）は読み込みまで通るのに、推論に入ると
 * onnxruntime-node が SIGTRAP で落ちる（メッセージも出ない）。ここに並べていないのは
 * そのため。Llama 系（llm-jp）と Gemma2 系は動く。
 */
import fs from 'node:fs';
import path from 'node:path';
import { modelsDir } from './localEmbed';
import { pickTopTokens, type NextToken } from './nextTokenPick';

export type { NextToken };

export type PredictModelId = '150m' | '440m' | '980m' | 'gemma2b';

interface ModelSpec {
  repo: string;
  label: string;
  mb: number;
  /** transformers.js に渡す量子化の種類 */
  dtype: 'q8' | 'q4f16';
  /** 取得済み判定に使うファイル（onnx/ からの相対）。重みが分かれているものは2つ以上 */
  files: string[];
}

/**
 * 選べるモデル。数値は手元（Apple Silicon / CPU）での実測値。
 * 大きいほど候補は納得しやすくなるが、ダウンロードも1手あたりの時間も増える。
 *   150m    : 日本の首都は → 東京 57% ／ 次の単語を → 含む・生成
 *   980m    : 日本の首都は → 東京 77% ／ 次の単語を → 生成 23%・予測 6%
 *   gemma2b : 日本の首都は → ？ 76%   ／ 次の単語を → 予測 91%
 * gemma2b は指示チューニング済みなので、疑問文になりやすい文だと「？」を1位に出す。
 */
export const PREDICT_MODELS: Record<PredictModelId, ModelSpec> = {
  '150m': {
    repo: 'onnx-community/llm-jp-3-150m-instruct3-ONNX',
    label: 'llm-jp-3-150m（軽量・1手 0.05秒）',
    mb: 153,
    dtype: 'q8',
    files: ['model_quantized.onnx'],
  },
  '440m': {
    repo: 'junhongwang/llm-jp-3-440m-instruct2',
    label: 'llm-jp-3-440m（中間・1手 0.1秒）',
    mb: 448,
    dtype: 'q8',
    files: ['model_quantized.onnx'],
  },
  '980m': {
    repo: 'junhongwang/llm-jp-3-980m-instruct3',
    label: 'llm-jp-3-980m（高精度・1手 0.2〜0.5秒）',
    mb: 991,
    dtype: 'q8',
    files: ['model_quantized.onnx'],
  },
  gemma2b: {
    repo: 'onnx-community/gemma-2-2b-jpn-it',
    label: 'gemma-2-2b-jpn（最高精度・1手 1〜3秒）',
    mb: 2600,
    // このリポジトリには q4f16 しか無い。重みが .onnx_data 側に入っているので取得判定も2つ見る
    dtype: 'q4f16',
    files: ['model_q4f16.onnx', 'model_q4f16.onnx_data'],
  },
};

interface Loaded {
  id: PredictModelId;
  tokenizer: any;
  model: any;
  /** 特殊トークン（<s> や </s> など）のID。候補に出しても意味が分からないので外す */
  special: Set<number>;
}

let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;

export function isPredictModelReady(id: PredictModelId): boolean {
  const spec = PREDICT_MODELS[id];
  if (!spec) return false;
  const dir = path.join(modelsDir(), ...spec.repo.split('/'));
  return (
    fs.existsSync(path.join(dir, 'tokenizer.json')) &&
    spec.files.every((f) => fs.existsSync(path.join(dir, 'onnx', f)))
  );
}

async function get(id: PredictModelId): Promise<Loaded> {
  if (loaded?.id === id) return loaded;
  if (loading) {
    const l = await loading;
    if (l.id === id) return l;
  }
  loading = (async () => {
    const { AutoTokenizer, AutoModelForCausalLM, env } = await import('@huggingface/transformers');
    fs.mkdirSync(modelsDir(), { recursive: true });
    env.cacheDir = modelsDir();
    const spec = PREDICT_MODELS[id];
    const tokenizer = await AutoTokenizer.from_pretrained(spec.repo);
    const model = await AutoModelForCausalLM.from_pretrained(spec.repo, { dtype: spec.dtype });
    // 別のモデルに切り替えたら前のものは持たない（gemma2b は 2.6GB ある）
    loaded = { id, tokenizer, model, special: specialIds(tokenizer) };
    return loaded;
  })().catch((e) => {
    loading = null; // 失敗を握り続けないでやり直せるようにする
    throw e;
  });
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

/**
 * 特殊トークンのID。llm-jp-3 では 0..7（<unk> <s> </s> <MASK|LLM-jp> …）。
 * decode すると "<s>" のような文字列がそのまま返ってくるので、候補から外さないと画面に出てしまう。
 */
function specialIds(tokenizer: any): Set<number> {
  return new Set<number>(
    (tokenizer.all_special_ids ?? []).filter((x: unknown): x is number => typeof x === 'number')
  );
}

/** 事前ダウンロード（展示当日に待たないよう設定画面から叩く） */
export async function preparePredictModel(id: PredictModelId): Promise<{ ready: boolean }> {
  await get(id);
  return { ready: isPredictModelReady(id) };
}

/** text の続きに来る1トークンの候補を、確率の高い順に topK 個返す */
export async function nextTokensLocal(text: string, topK: number, id: PredictModelId): Promise<NextToken[]> {
  const { tokenizer, model, special } = await get(id);
  // BOS を付ける（付けないと分布が平らになり、説明にならない）
  const inputs = await tokenizer(text, { add_special_tokens: true });
  const out = await model(inputs);
  const [, seq, vocab] = out.logits.dims as [number, number, number];
  const data = out.logits.data as Float32Array;
  // 最後の位置＝「次の1トークン」の予測
  const row = data.subarray((seq - 1) * vocab, seq * vocab);
  return pickTopTokens(row, { topK, special, decode: (id) => tokenizer.decode([id]) });
}
