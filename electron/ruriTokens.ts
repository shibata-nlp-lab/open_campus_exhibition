/**
 * Ruri（SentencePiece Unigram）のトークン片を、画面に出せる形へ整える。
 *
 * モデルもトークナイザも要らない純粋な処理なので分けてある
 * （テストのためにモデルを 100MB 単位でダウンロードしたくない）。
 */

export interface RuriToken {
  id: number;
  text: string;
}

const BYTE_TOKEN = /^<0x([0-9A-Fa-f]{2})>$/;

/**
 * 語彙にない文字は `<0xNN>` のバイト列に落ちるので、連続するバイトトークンは
 * まとめて文字に戻す（画面に `<0xE3>` と出しても展示にならない）。
 * 復元した文字は、そのもとになったトークン全部に同じものを入れる。
 *
 * `▁` は空白を表すので通常の空白に戻し、入力には無かった先頭の空白は落とす。
 */
export function toDisplayTokens(pieces: string[], ids: number[]): RuriToken[] {
  const out: RuriToken[] = [];
  for (let i = 0; i < pieces.length; i++) {
    if (!BYTE_TOKEN.test(pieces[i])) {
      out.push({ id: ids[i] ?? 0, text: pieces[i].replace(/▁/g, ' ') });
      continue;
    }
    const start = i;
    const bytes: number[] = [];
    while (i < pieces.length) {
      const m = BYTE_TOKEN.exec(pieces[i]);
      if (!m) break;
      bytes.push(parseInt(m[1], 16));
      i++;
    }
    i--;
    const decoded = new TextDecoder().decode(Uint8Array.from(bytes));
    for (let k = start; k <= i; k++) out.push({ id: ids[k] ?? 0, text: decoded });
  }

  if (out.length && out[0].text.trim() === '') out.shift();
  if (out.length) out[0] = { ...out[0], text: out[0].text.replace(/^ /, '') };
  return out;
}
