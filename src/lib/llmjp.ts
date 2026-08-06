/**
 * llm-jp（SentencePiece Unigram）のトークナイザ。
 *
 * 語彙とスコアは src/content/llmjp-vocab.json（llm-jp/llm-jp-3-1.8b 由来・Apache-2.0）。
 * Unigram は「語彙に含まれる断片へ分割したときのスコア合計が最大になる切り方」を選ぶ方式なので、
 * Viterbi（動的計画法）で最適分割を求めれば本家と同じ結果が得られる。
 *
 * 正規化は tokenizer.json の normalizer に合わせて
 *   - 半角スペースを ▁ に置換
 *   - 文頭に ▁ を付与
 * のみ行う（llm-jp は pre_tokenizer を持たない）。
 */
import type { Tok } from './tokenizer';

const SPACE = '▁'; // ▁

interface Vocab {
  tokens: string[];
  scores: number[];
  index: Map<string, number>;
  maxLen: number;
  byteFallback: boolean;
}

let vocab: Vocab | null = null;
let loading: Promise<Vocab | null> | null = null;

async function load(): Promise<Vocab | null> {
  if (vocab) return vocab;
  if (!loading) {
    loading = (async () => {
      try {
        const data = (await import('../content/llmjp-vocab.json')).default as {
          tokens: string[];
          scores: number[];
          byteFallback: boolean;
        };
        const index = new Map<string, number>();
        let maxLen = 1;
        data.tokens.forEach((t, i) => {
          if (!index.has(t)) index.set(t, i);
          if (t.length > maxLen) maxLen = t.length;
        });
        vocab = {
          tokens: data.tokens,
          scores: data.scores,
          index,
          maxLen: Math.min(maxLen, 32),
          byteFallback: data.byteFallback,
        };
        return vocab;
      } catch (e) {
        console.warn('llm-jp vocab load failed', e);
        return null;
      }
    })();
  }
  return loading;
}

const normalize = (text: string) => SPACE + text.replace(/ /g, SPACE);

/** UTF-16 のサロゲートペアの途中で切らないための境界判定 */
function isBoundary(s: string, i: number) {
  if (i <= 0 || i >= s.length) return true;
  const prev = s.charCodeAt(i - 1);
  const cur = s.charCodeAt(i);
  return !(prev >= 0xd800 && prev <= 0xdbff && cur >= 0xdc00 && cur <= 0xdfff);
}

/** 語彙にない文字は UTF-8 バイト単位の <0xNN> トークンに落とす */
function byteTokens(v: Vocab, ch: string): number[] {
  const bytes = new TextEncoder().encode(ch);
  const ids: number[] = [];
  for (const b of bytes) {
    const id = v.index.get(`<0x${b.toString(16).toUpperCase().padStart(2, '0')}>`);
    ids.push(id ?? 0);
  }
  return ids;
}

export async function tokenizeLlmJp(text: string): Promise<{ tokens: Tok[]; approximate: boolean } | null> {
  const v = await load();
  if (!v) return null;

  const s = normalize(text);
  const n = s.length;
  const NEG = -1e10;
  const best = new Array<number>(n + 1).fill(NEG);
  const fromPos = new Array<number>(n + 1).fill(-1);
  const pieceId = new Array<number>(n + 1).fill(-1);
  best[0] = 0;

  for (let i = 0; i < n; i++) {
    if (best[i] === NEG || !isBoundary(s, i)) continue;
    let matched = false;
    for (let len = 1; len <= v.maxLen && i + len <= n; len++) {
      if (!isBoundary(s, i + len)) continue;
      const id = v.index.get(s.slice(i, i + len));
      if (id === undefined) continue;
      matched = true;
      const score = best[i] + v.scores[id];
      if (score > best[i + len]) {
        best[i + len] = score;
        fromPos[i + len] = i;
        pieceId[i + len] = id;
      }
    }
    if (!matched) {
      // 1文字ぶん進める（バイトフォールバックは復元時に展開する）
      const len = isBoundary(s, i + 1) ? 1 : 2;
      const score = best[i] - 100;
      if (score > best[i + len]) {
        best[i + len] = score;
        fromPos[i + len] = i;
        pieceId[i + len] = -1;
      }
    }
  }

  // 復元
  const out: Tok[] = [];
  let pos = n;
  while (pos > 0) {
    const prev = fromPos[pos];
    if (prev < 0) break;
    const id = pieceId[pos];
    if (id >= 0) {
      out.push({ id, text: v.tokens[id].replace(new RegExp(SPACE, 'g'), ' ') });
    } else {
      const ch = s.slice(prev, pos);
      for (const bid of byteTokens(v, ch).reverse()) out.push({ id: bid, text: ch });
    }
    pos = prev;
  }
  out.reverse();

  // 文頭に付けた ▁ は表示上のノイズなので取り除く
  if (out.length && out[0].text.trim() === '') out.shift();
  if (out.length) out[0] = { ...out[0], text: out[0].text.replace(/^ /, '') };

  return { tokens: out, approximate: false };
}

/** 語彙のうち日本語の語らしいものを返す（近傍プール用に使える） */
export async function listLlmJpVocab(): Promise<string[]> {
  const v = await load();
  if (!v) return [];
  return v.tokens
    .map((t) => t.replace(new RegExp(SPACE, 'g'), ''))
    .filter((t) => /^[ぁ-んァ-ヴー一-龯々]{2,12}$/.test(t));
}
