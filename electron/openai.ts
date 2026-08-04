import type { TokenCandidate } from '../src/types';

const API_BASE = 'https://api.openai.com/v1';

/** 展示中に固まらないよう、応答が来なければ打ち切る */
const TIMEOUT_MS = 15000;
/** 語彙一括のような大きい埋め込みは時間がかかるので長めに待つ */
const EMBED_TIMEOUT_MS = 60000;
/** 1リクエストあたりの入力数上限（API の上限は 2048） */
const EMBED_BATCH = 1000;

async function post(pathname: string, apiKey: string, body: unknown, timeoutMs = TIMEOUT_MS) {
  let res: Response;
  try {
    res = await fetch(API_BASE + pathname, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`OpenAI API の応答がありません（${timeoutMs / 1000}秒でタイムアウト）`);
    }
    throw new Error(
      `OpenAI API に接続できません: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `OpenAI API エラー (${res.status})`;
    try {
      const j = JSON.parse(text);
      if (j?.error?.message) message += `: ${j.error.message}`;
    } catch {
      if (text) message += `: ${text.slice(0, 200)}`;
    }
    throw new Error(message);
  }
  return res.json();
}

const CONTINUE_SYSTEM =
  '与えられたテキストの続きを、そのまま自然に書き足してください。' +
  '説明・前置き・引用符は一切書かず、続きの文字だけを出力します。文が完成したら句点で終えて構いません。';

/**
 * 現在のテキストに続く「次のトークン」の候補を確率つきで返す。
 * chat.completions の logprobs / top_logprobs を利用する。
 */
export async function nextTokenCandidates(
  apiKey: string,
  model: string,
  text: string,
  topK: number
): Promise<TokenCandidate[]> {
  const json = await post('/chat/completions', apiKey, {
    model,
    messages: [
      { role: 'system', content: CONTINUE_SYSTEM },
      { role: 'user', content: text },
    ],
    max_tokens: 1,
    temperature: 1,
    logprobs: true,
    top_logprobs: Math.min(Math.max(topK, 1), 20),
  });

  const entry = json?.choices?.[0]?.logprobs?.content?.[0];
  if (!entry) throw new Error('logprobs が取得できませんでした（モデルが対応していない可能性があります）');

  const tops: Array<{ token: string; logprob: number }> = entry.top_logprobs ?? [
    { token: entry.token, logprob: entry.logprob },
  ];

  return tops
    .map((t) => ({ token: t.token, logprob: t.logprob, prob: Math.exp(t.logprob) }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, topK);
}

export async function embed(
  apiKey: string,
  model: string,
  inputs: string[],
  dimensions?: number
): Promise<number[][]> {
  const out: number[][] = [];
  // 入力数の上限があるので分割して投げる（3,800語の語彙などはここを通る）
  for (let i = 0; i < inputs.length; i += EMBED_BATCH) {
    const chunk = inputs.slice(i, i + EMBED_BATCH);
    const json = await post(
      '/embeddings',
      apiKey,
      { model, input: chunk, ...(dimensions ? { dimensions } : {}) },
      EMBED_TIMEOUT_MS
    );
    const data: Array<{ index: number; embedding: number[] }> = json.data ?? [];
    out.push(...data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
  }
  return out;
}

export async function verifyKey(apiKey: string): Promise<boolean> {
  const res = await fetch(API_BASE + '/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.ok;
}
