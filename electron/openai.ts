import type { TokenCandidate } from '../src/types';

const API_BASE = 'https://api.openai.com/v1';

async function post(pathname: string, apiKey: string, body: unknown) {
  const res = await fetch(API_BASE + pathname, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
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
  const json = await post('/embeddings', apiKey, {
    model,
    input: inputs,
    ...(dimensions ? { dimensions } : {}),
  });
  const data: Array<{ index: number; embedding: number[] }> = json.data ?? [];
  return data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function verifyKey(apiKey: string): Promise<boolean> {
  const res = await fetch(API_BASE + '/models', { headers: { Authorization: `Bearer ${apiKey}` } });
  return res.ok;
}
