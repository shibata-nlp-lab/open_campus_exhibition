/**
 * スライド用の Markdown 前処理（Marp 記法の一部に対応）。
 *
 * 進行画面（SlideStep）から使うが、DOM も Electron も要らない純粋関数なので分けてある。
 *
 * 対応しているのは次の範囲。Marp 本体のテーマ（`theme:`）は当てられない。
 *   - フロントマター（先頭の `---` ブロック）の `style:` … そのままページに適用する
 *   - フロントマターの `class:` / `paginate:` / `backgroundColor:` / `color:`
 *   - ページ内のディレクティブコメント `<!-- _class: title -->` など
 *     先頭が `_` のものはそのページだけ、無いものはそれ以降のページにも効く（Marp と同じ）
 *   - `key: value` の形でないコメント（`<!-- ただのメモ -->`）は表示から取り除くだけ
 *   - ページ本文中の `<style>` / `<style scoped>` … 前者はスライド全体、後者はそのページだけ
 */

/** 1ページぶん */
export interface MarpPage {
  /** 本文（ディレクティブのコメントと `<style>` を取り除いたもの） */
  markdown: string;
  /** このページだけに効く CSS（`<style scoped>`） */
  style: string;
  /** `class:` で指定されたクラス。CSS の `section.title` などに使う */
  classes: string[];
  /** ページ番号を出すか */
  paginate: boolean;
  backgroundColor?: string;
  color?: string;
}

export interface MarpDoc {
  pages: MarpPage[];
  /** スライド全体に効く CSS（フロントマターの `style:` と、scoped でない `<style>`） */
  style: string;
}

/** ページ間で引き継ぐディレクティブ */
interface Directives {
  classes: string[];
  paginate: boolean;
  backgroundColor?: string;
  color?: string;
}

const BOOL = (v: string) => v.trim().toLowerCase() === 'true';

/**
 * フロントマターを読む。YAML のうち「key: value」と「key: |」のブロックだけを見る簡易実装。
 * 先頭が `---` の行で始まっていないときはフロントマター無しとみなす。
 *
 * `key: value` が 1 つも無いときも**フロントマター無し**として本文を丸ごと返す。
 * 先頭の `---` をページ区切りのつもりで書いた .md を、
 * 次の `---` までまるごと食べて真っ白にしてしまわないため
 * （Marp 本体はこの場合 1 ページ目が空になる。展示では事故のほうが痛いので、こちらは拾う）。
 */
function readFrontMatter(lines: string[]): { data: Record<string, string>; rest: string[] } {
  if (lines[0]?.trim() !== '---') return { data: {}, rest: lines };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) return { data: {}, rest: lines };

  const data: Record<string, string> = {};
  const body = lines.slice(1, end);
  for (let i = 0; i < body.length; i++) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(body[i]);
    if (!m) continue;
    const [, key, raw] = m;
    if (/^[|>]-?$/.test(raw.trim())) {
      // ブロックスカラー。続くインデント行をまとめて取り、共通のインデントを外す
      const block: string[] = [];
      let j = i + 1;
      for (; j < body.length; j++) {
        if (body[j].trim() === '') {
          block.push('');
          continue;
        }
        if (!/^\s/.test(body[j])) break;
        block.push(body[j]);
      }
      const indents = block.filter((l) => l.trim() !== '').map((l) => l.match(/^\s*/)![0].length);
      const pad = indents.length ? Math.min(...indents) : 0;
      data[key] = block.map((l) => l.slice(pad)).join('\n').trim();
      i = j - 1;
    } else {
      data[key] = raw.trim().replace(/^["']|["']$/g, '');
    }
  }
  if (Object.keys(data).length === 0) return { data: {}, rest: lines };
  return { data, rest: lines.slice(end + 1) };
}

/**
 * ページ本文から `<style>` を抜き出す（本文からは取り除く）。
 * `scoped` が付いていればそのページだけ、無ければスライド全体に効く（Marp と同じ）。
 */
function takeStyles(text: string): { markdown: string; scoped: string[]; global: string[] } {
  const scoped: string[] = [];
  const global: string[] = [];
  const markdown = text.replace(
    /<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi,
    (_whole, attrs: string, css: string) => {
      (/\bscoped\b/i.test(attrs) ? scoped : global).push(css.trim());
      return '';
    }
  );
  return { markdown, scoped, global };
}

/**
 * `---` でページに割る。
 * コードフェンス（``` や ~~~）の中の `---` は区切りとして扱わない。
 */
function splitPages(lines: string[]): string[][] {
  const pages: string[][] = [[]];
  let fence: string | null = null;
  for (const line of lines) {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (line.trim().startsWith(fence)) fence = null;
    }
    if (!fence && /^\s*---\s*$/.test(line)) {
      pages.push([]);
      continue;
    }
    pages[pages.length - 1].push(line);
  }
  return pages;
}

/** ページ本文からディレクティブコメントを抜き出し、コメントは本文から取り除く */
function takeDirectives(text: string, carried: Directives): { markdown: string; own: Directives } {
  const own: Directives = { ...carried, classes: [...carried.classes] };

  const markdown = text.replace(/<!--([\s\S]*?)-->/g, (_whole, inner: string) => {
    for (const line of String(inner).split('\n')) {
      const m = /^\s*(_?)([A-Za-z][\w-]*)\s*:\s*(.+?)\s*$/.exec(line);
      if (!m) continue; // 「ただのメモ」はディレクティブではないので無視
      const [, local, key, value] = m;
      const target = own; // このページには必ず効く
      switch (key) {
        case 'class':
          target.classes = value.split(/\s+/).filter(Boolean);
          if (!local) carried.classes = [...target.classes];
          break;
        case 'paginate':
          target.paginate = BOOL(value);
          if (!local) carried.paginate = target.paginate;
          break;
        case 'backgroundColor':
          target.backgroundColor = value;
          if (!local) carried.backgroundColor = value;
          break;
        case 'color':
          target.color = value;
          if (!local) carried.color = value;
          break;
        default:
          break; // theme など、当てられないものは黙って無視する
      }
    }
    return '';
  });

  return { markdown, own };
}

/** フロントマターだけを読む（`marp: true` の判定などに使う） */
export function frontMatterOf(src: string): Record<string, string> {
  return readFrontMatter(src.replace(/\r\n/g, '\n').split('\n')).data;
}

/** Marp 記法の Markdown を、ページとスタイルに分解する */
export function parseMarp(src: string): MarpDoc {
  const { data, rest } = readFrontMatter(src.replace(/\r\n/g, '\n').split('\n'));

  const carried: Directives = {
    classes: (data.class ?? '').split(/\s+/).filter(Boolean),
    paginate: BOOL(data.paginate ?? 'false'),
    backgroundColor: data.backgroundColor,
    color: data.color,
  };

  const pages: MarpPage[] = [];
  // scoped でない <style> はスライド全体に効くので、どのページで書かれていてもまとめて集める
  const globalStyles: string[] = data.style ? [data.style] : [];

  for (const lines of splitPages(rest)) {
    const { markdown: withStyles, own } = takeDirectives(lines.join('\n'), carried);
    const { markdown, scoped, global } = takeStyles(withStyles);
    globalStyles.push(...global);

    const body = markdown.trim();
    if (!body) continue; // 空ページ（末尾の --- など）は落とす。style だけは上で回収済み
    pages.push({
      markdown: body,
      style: scoped.join('\n'),
      classes: own.classes,
      paginate: own.paginate,
      backgroundColor: own.backgroundColor,
      color: own.color,
    });
  }

  return {
    pages: pages.length ? pages : [{ markdown: '', style: '', classes: [], paginate: false }],
    style: globalStyles.join('\n'),
  };
}

/** ページ本文だけが欲しいとき用 */
export function splitMarkdown(src: string): string[] {
  return parseMarp(src).pages.map((p) => p.markdown);
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
