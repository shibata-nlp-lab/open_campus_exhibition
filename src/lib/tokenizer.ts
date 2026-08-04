/** js-tiktoken（o200k_base）による BPE トークナイズ。読み込みは遅延・失敗時は文字単位にフォールバック */
import { JOYO_KANJI } from '../content/joyo';

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

/**
 * o200k_base から日本語の語彙を抽出する。
 * 判定は Zenn の記事「GPT-4oのトークナイザから日本語語彙の抽出方法」(hellorusk) の方式に準拠:
 *   条件1: ひらがな・カタカナを1文字でも含む
 *   条件2: 常用漢字のみで構成される
 * ただし条件2は 2 文字以上を採用する（記事は4文字以上で絞っていた）。
 *
 * 常用漢字の縛りが効くので、簡体字や日本語にない漢字を使う中国語がここで大きく落ちる。
 */
let japaneseTokenCache: string[] | null = null;

const KANA = /[ぁ-んァ-ヴー]/;
const KANJI_ONLY = /^[一-龯々]+$/;

/**
 * 常用漢字の縛りをすり抜ける中国語スパム（賭博・アダルト系）。
 * 日本語と共通の漢字だけで書かれているため文字種では落とせず、語幹で除外するしかない。
 * 高校生に見せる展示なので、ここは安全側に倒している。
 */
const SPAM_STEMS = [
  '彩票', '毛片', '色情', '人妻', '大香', '独胆', '开奖', '開奖', '偷拍',
  '试看', '赌', '淫', '裸聊', '做爱', '一级片', '三級片', 'av在线',
];

export function isJapaneseVocabToken(s: string): boolean {
  if (s.length < 2 || s.length > 12) return false;
  // 記号・英数字・空白が混ざるものは語として扱わない
  if (!/^[ぁ-んァ-ヴー一-龯々]+$/.test(s)) return false;
  if (SPAM_STEMS.some((w) => s.includes(w))) return false;
  if (KANA.test(s)) return true;
  if (KANJI_ONLY.test(s)) return [...s].every((c) => JOYO_KANJI.has(c));
  return false;
}

export async function listJapaneseTokens(): Promise<string[]> {
  if (japaneseTokenCache) return japaneseTokenCache;
  await ensure();
  if (!encoder) return [];
  const out: string[] = [];
  for (let id = 0; id < 200000; id++) {
    let s: string;
    try {
      s = encoder.decode([id]);
    } catch {
      continue;
    }
    if (isJapaneseVocabToken(s)) out.push(s);
  }
  japaneseTokenCache = out;
  return out;
}
