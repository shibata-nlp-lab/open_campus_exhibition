/**
 * スライド用の Markdown 前処理。
 * 進行画面（SlideStep）から使うが、DOM も Electron も要らない純粋関数なので分けてある。
 */

/** Marp のフロントマター / ディレクティブを取り除き、--- で分割 */
export function splitMarkdown(src: string): string[] {
  let text = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''); // フロントマター
  text = text.replace(/^<!--[\s\S]*?-->\s*$/gm, ''); // Marp のコメントディレクティブ
  const pages = text
    .split(/^\s*---\s*$/m)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return pages.length ? pages : [text];
}

/**
 * 外部 .md を参照している場合、相対パスの画像を表示できる URL に置き換える。
 *
 * @param baseDir .md が置かれているディレクトリの絶対パス
 * @param toUrl   絶対パスをレンダラから読める URL に変換する関数（実際は api.file.url）
 */
export function resolveRelativeAssets(
  html: string,
  baseDir: string | null,
  toUrl: (abs: string) => string
): string {
  if (!baseDir) return html;
  return html.replace(/(src|href)="([^"]+)"/g, (whole, attr, value: string) => {
    // 絶対 URL・アンカー・プロトコル相対はそのまま
    if (/^([a-z]+:|#|\/\/)/i.test(value)) return whole;
    try {
      const abs = new URL(value, `file://${baseDir.endsWith('/') ? baseDir : baseDir + '/'}`).pathname;
      return `${attr}="${toUrl(decodeURIComponent(abs))}"`;
    } catch {
      return whole;
    }
  });
}
