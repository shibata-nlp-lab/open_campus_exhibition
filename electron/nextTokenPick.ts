/**
 * ロジット（モデルの生の出力）から「次の1トークン」の候補を選ぶところだけを切り出したもの。
 * モデルを読み込まずに試せるようにしてある。
 */

export interface NextToken {
  token: string;
  prob: number;
  logprob: number;
}

export interface PickOptions {
  /** 何個返すか */
  topK: number;
  /** 候補に出さないトークンID（<s> や </s> など。decode すると文字列で出てしまう） */
  special: Set<number>;
  /** トークンID → 表示する文字列 */
  decode: (id: number) => string;
}

/**
 * 確率は softmax したそのままの値を返す（捨てた分を配り直して 1 に揃えたりしない）。
 * 「上位5つを足しても100%にならない」ことこそが、次の語が広く散らばっているという説明になるため。
 */
export function pickTopTokens(row: ArrayLike<number>, { topK, special, decode }: PickOptions): NextToken[] {
  const n = row.length;
  if (n === 0 || topK <= 0) return [];

  let max = -Infinity;
  for (let i = 0; i < n; i++) if (row[i] > max) max = row[i];
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.exp(row[i] - max);

  // 特殊トークンや表示できないものを捨てたあとでも足りるよう、多めに取ってから絞る。
  // 語彙は約10万なので、並べ替えても推論そのもの（数十ミリ秒）に比べれば無視できる
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => row[b] - row[a])
    .slice(0, topK + 24);

  const out: NextToken[] = [];
  for (const id of order) {
    if (out.length >= topK) break;
    if (special.has(id)) continue;
    const token = decode(id);
    if (!token) continue; // 表示できないトークンは出しても意味が分からない
    const prob = Math.exp(row[id] - max) / sum;
    out.push({ token, prob, logprob: Math.log(prob) });
  }
  return out;
}
