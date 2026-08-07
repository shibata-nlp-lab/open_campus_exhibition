/**
 * Marp Core による描画。
 *
 * 自前の簡易パーサ（[markdown.ts](markdown.ts) の `parseMarp`）ではテーマ CSS を当てられないので、
 * **フロントマターに `marp: true` があるものだけ**本家の Marp Core に通す。
 * 付いていない Markdown はこれまでどおりの描画なので、既存の教材の見た目は変わらない
 * （`marp: true` は Marp 自身のオプトイン用フラグでもある）。
 *
 * 本体は 1MB 弱あるので、実際に Marp のスライドを開くまで読み込まない（動的 import）。
 */
import { frontMatterOf } from './markdown';

export interface MarpRender {
  /** 1ページぶんの HTML（`<svg data-marpit-svg>…`）。`div.marpit` で包んで使う */
  slides: string[];
  /** テーマ + style: をまとめた CSS */
  css: string;
}

/** この Markdown を Marp Core で描くか */
export const isMarpDocument = (src: string) => frontMatterOf(src).marp === 'true';

/** 自作テーマ CSS の名前（`/* @theme name *​/`）を取り出す */
export function themeNameOf(css: string): string | null {
  return /\/\*\s*@theme\s+([\w-]+)\s*\*\//.exec(css)?.[1] ?? null;
}

type MarpCtor = new (opts?: Record<string, unknown>) => {
  themeSet: { add: (css: string) => unknown };
  render: (md: string, opts: { htmlAsArray: true }) => { html: string[]; css: string };
};

let ctor: MarpCtor | null = null;

async function load(): Promise<MarpCtor> {
  if (!ctor) ctor = (await import('@marp-team/marp-core')).Marp as unknown as MarpCtor;
  return ctor;
}

/**
 * @param themes 追加で使える自作テーマの CSS（`/* @theme name *​/` で始まるもの）
 */
export async function renderMarp(src: string, themes: string[] = []): Promise<MarpRender> {
  const Marp = await load();
  const marp = new Marp();

  for (const css of themes) {
    try {
      marp.themeSet.add(css);
    } catch (e) {
      // 名前が無いなど、テーマとして読めないものは飛ばす（1つのせいで全部止めない）
      console.warn('marp theme skipped', e);
    }
  }

  const { html, css } = marp.render(src, { htmlAsArray: true });
  return { slides: html, css: stripRemoteImports(css) };
}

/**
 * 外部フォントの読み込み（`@import "https://fonts.bunny.net/…"`）を落とす。
 * 展示は回線が無い前提で動かすので、出ない可能性のあるものを待たない。
 */
export function stripRemoteImports(css: string): string {
  return css.replace(/@import\s+(?:url\()?["']?https?:\/\/[^;]*;/g, '');
}
