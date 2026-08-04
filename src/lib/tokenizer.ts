/** js-tiktoken（o200k_base）による BPE トークナイズ。読み込みは遅延・失敗時は文字単位にフォールバック */

export interface Tok {
  id: number;
  text: string;
}

let encoder: { encode: (s: string) => number[]; decode: (t: number[]) => string } | null = null;
let loading: Promise<void> | null = null;
let failed = false;

async function ensure() {
  if (encoder || failed) return;
  if (!loading) {
    loading = (async () => {
      try {
        const [{ Tiktoken }, ranks] = await Promise.all([
          import('js-tiktoken/lite'),
          import('js-tiktoken/ranks/o200k_base'),
        ]);
        encoder = new Tiktoken((ranks as any).default ?? ranks) as any;
      } catch (e) {
        console.warn('tokenizer load failed', e);
        failed = true;
      }
    })();
  }
  await loading;
}

export async function tokenize(text: string): Promise<{ tokens: Tok[]; approximate: boolean }> {
  await ensure();
  if (!encoder) {
    // フォールバック: 1文字1トークン扱い
    return {
      tokens: [...text].map((ch) => ({ id: ch.codePointAt(0) ?? 0, text: ch })),
      approximate: true,
    };
  }
  const ids = encoder.encode(text);
  return {
    tokens: ids.map((id) => ({ id, text: encoder!.decode([id]) })),
    approximate: false,
  };
}
