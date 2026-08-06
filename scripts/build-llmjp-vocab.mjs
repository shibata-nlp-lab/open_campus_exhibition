/**
 * llm-jp のトークナイザ語彙を取り込んで src/content/llmjp-vocab.json を生成する。
 *
 * 取得元: https://huggingface.co/llm-jp/llm-jp-3-1.8b (Apache-2.0)
 * tokenizer.json は SentencePiece Unigram で、[トークン, スコア] の配列を持つ。
 * アプリ側ではこのスコアを使って Viterbi で最適分割するので、語彙とスコアだけあればよい。
 *
 *   node scripts/build-llmjp-vocab.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'https://huggingface.co/llm-jp/llm-jp-3-1.8b/resolve/main/tokenizer.json';
const OUT = path.join(root, 'src/content/llmjp-vocab.json');

const res = await fetch(SRC);
if (!res.ok) throw new Error(`ダウンロード失敗: ${res.status}`);
const tok = await res.json();

if (tok.model?.type !== 'Unigram') throw new Error(`想定外のモデル形式: ${tok.model?.type}`);

const vocab = tok.model.vocab;
const tokens = vocab.map(([t]) => t);
// スコアは小数4桁で十分（Viterbi の順序が変わらない範囲で軽くする）
const scores = vocab.map(([, s]) => Math.round(s * 10000) / 10000);

fs.writeFileSync(
  OUT,
  JSON.stringify({
    source: 'llm-jp/llm-jp-3-1.8b tokenizer.json (Apache-2.0)',
    byteFallback: Boolean(tok.model.byte_fallback),
    unkId: tok.model.unk_id ?? 0,
    tokens,
    scores,
  }),
  'utf-8'
);

console.log(`${tokens.length} トークンを書き出しました: ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB`);
