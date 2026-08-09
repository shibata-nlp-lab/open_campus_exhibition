/**
 * 「1, 3, 5」のようなカンマ区切りの入力と、数値の配列との変換。
 *
 * 打っている途中の文字列をそのまま往復させると区切りが消えてしまうので、
 * 入力欄側は生の文字列を持ち、保存のときだけ parse する（editors.tsx の NumberListField）。
 */

/** 数字以外はすべて区切りとして扱う（読点でも空白でも受け付ける） */
function pieces(text: string): string[] {
  return text.split(/[^0-9.]+/).filter((p) => p !== '' && p !== '.');
}

/**
 * 見せる単語の位置。画面では 1 番目から数え、保存は 0 起点にする。
 * 0 以下（「0 番目」）は捨てる。
 */
export function parseIndexList(text: string): number[] {
  return pieces(text)
    .map((n) => Math.floor(Number(n)) - 1)
    .filter((n) => Number.isFinite(n) && n >= 0);
}

export const formatIndexList = (list: number[]) => (list ?? []).map((n) => n + 1).join(', ');

/**
 * 秒数の並び。こちらは位置ではないのでずらさず、**0 も残す**
 * （0 = 待たずに次の単語へ移る、という指定）。小数も受け付ける。
 */
export function parseSecList(text: string): number[] {
  return pieces(text)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

export const formatSecList = (list: number[]) => (list ?? []).join(', ');
