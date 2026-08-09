/**
 * 「1, 3, 5」のような入力と、0 起点の位置の配列との変換。
 *
 * 画面では 1 番目から数え、保存は 0 起点にする。
 * 打っている途中の文字列をそのまま往復させると区切りが消えてしまうので、
 * 入力欄側は生の文字列を持ち、保存のときだけ parse する（editors.tsx の IndexListField）。
 */

/** 数字以外はすべて区切りとして扱う（読点でも空白でも受け付ける） */
export function parseIndexList(text: string): number[] {
  return text
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((n) => Number(n) - 1)
    .filter((n) => n >= 0);
}

export const formatIndexList = (list: number[]) => (list ?? []).map((n) => n + 1).join(', ');
