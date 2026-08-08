/**
 * 並べ替えたときに「正解」が同じ選択肢を指し続けるように、インデックスを補正する。
 *
 * クイズとゲームのどちらでも使う。ずれると**正解が別の選択肢になってしまう**ので、
 * 純粋関数として切り出してテストしてある。
 *
 * @param answer 補正したいインデックス（正解の位置）
 * @param from   動かした要素の元の位置
 * @param to     動かした先
 */
export function shiftIndex(answer: number, from: number, to: number): number {
  if (answer === from) return to;
  if (from < answer && to >= answer) return answer - 1;
  if (from > answer && to <= answer) return answer + 1;
  return answer;
}
