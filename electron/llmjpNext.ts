/**
 * llm-jp-3 を丸ごとこの PC で動かし、「次に来る1トークン」の確率を出す。
 *
 * 体験②はこれまで OpenAI の top_logprobs だけだった。こちらは
 * - APIキー不要・通信なし（初回のダウンロードだけ必要）
 * - 日本語のモデルなので、トークンが語のかたまりで出て高校生にも読みやすい
 * という違いがある。体験①の llm-jp（埋め込み層＝表を引くだけ）とは別物で、
 * こちらはモデル本体を forward させている。
 *
 * 重みは量子化 ONNX（dtype: 'q8'）。サイズは 3 種類から選べる。
 * 先頭に BOS（<s>）を付けるかどうかで分布がはっきり変わるので必ず付ける。
 *   「日本の首都は」→ 東京 57%（BOSあり） / 東京 1.9%（BOSなし）
 */
import fs from 'node:fs';
import path from 'node:path';
import { modelsDir } from './localEmbed';
import { pickTopTokens, type NextToken } from './nextTokenPick';

export type { NextToken };

export type LlmJpNextSize = '150m' | '440m' | '980m';

/**
 * 選べるモデル。ラベルの数値は手元（Apple Silicon / CPU）での実測値。
 * 大きいほど候補が「らしく」なるが、ダウンロードも1手あたりの時間も増える。
 *   150m: 日本の首都は → 東京 57%  ／ 次の単語を → 含む・使用…
 *   980m: 日本の首都は → 東京 77%  ／ 次の単語を → 生成 23%・予測 6%
 */
export const LLMJP_NEXT_MODELS: Record<LlmJpNextSize, { repo: string; label: string; mb: number }> = {
  '150m': { repo: 'onnx-community/llm-jp-3-150m-instruct3-ONNX', label: 'llm-jp-3-150m（軽量・1手 0.05秒）', mb: 153 },
  '440m': { repo: 'junhongwang/llm-jp-3-440m-instruct2', label: 'llm-jp-3-440m（中間・1手 0.1秒）', mb: 448 },
  '980m': { repo: 'junhongwang/llm-jp-3-980m-instruct3', label: 'llm-jp-3-980m（高精度・1手 0.2〜0.5秒）', mb: 991 },
};

/** 量子化 ONNX のファイル名（dtype: 'q8' がこれを読む） */
const ONNX_FILE = 'model_quantized.onnx';

interface Loaded {
  size: LlmJpNextSize;
  tokenizer: any;
  model: any;
  /** 特殊トークン（<s> や </s> など）のID。候補に出しても意味が分からないので外す */
  special: Set<number>;
}

let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;

export function isLlmJpNextReady(size: LlmJpNextSize): boolean {
  const parts = LLMJP_NEXT_MODELS[size].repo.split('/');
  const onnx = path.join(modelsDir(), ...parts, 'onnx', ONNX_FILE);
  const tok = path.join(modelsDir(), ...parts, 'tokenizer.json');
  return fs.existsSync(onnx) && fs.existsSync(tok);
}

async function get(size: LlmJpNextSize): Promise<Loaded> {
  if (loaded?.size === size) return loaded;
  if (loading) {
    const l = await loading;
    if (l.size === size) return l;
  }
  loading = (async () => {
    const { AutoTokenizer, AutoModelForCausalLM, env } = await import('@huggingface/transformers');
    fs.mkdirSync(modelsDir(), { recursive: true });
    env.cacheDir = modelsDir();
    const { repo } = LLMJP_NEXT_MODELS[size];
    const tokenizer = await AutoTokenizer.from_pretrained(repo);
    const model = await AutoModelForCausalLM.from_pretrained(repo, { dtype: 'q8' });
    // 大きいモデルに切り替えたら前のものは持たない（980m は 1GB 近い）
    loaded = { size, tokenizer, model, special: specialIds(tokenizer) };
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
export async function prepareLlmJpNext(size: LlmJpNextSize): Promise<{ ready: boolean }> {
  await get(size);
  return { ready: isLlmJpNextReady(size) };
}

/** text の続きに来る1トークンの候補を、確率の高い順に topK 個返す */
export async function nextTokensLlmJp(text: string, topK: number, size: LlmJpNextSize): Promise<NextToken[]> {
  const { tokenizer, model, special } = await get(size);
  // BOS を付ける（付けないと分布が平らになり、説明にならない）
  const inputs = await tokenizer(text, { add_special_tokens: true });
  const out = await model(inputs);
  const [, seq, vocab] = out.logits.dims as [number, number, number];
  const data = out.logits.data as Float32Array;
  // 最後の位置＝「次の1トークン」の予測
  const row = data.subarray((seq - 1) * vocab, seq * vocab);
  return pickTopTokens(row, { topK, special, decode: (id) => tokenizer.decode([id]) });
}
