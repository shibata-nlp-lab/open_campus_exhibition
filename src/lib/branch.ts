/**
 * 分岐画面（体験に戻る）の戻り先を、シナリオのステップ列から探す。
 *
 * 同じ体験を 2 か所に置いているシナリオもあるので、まず分岐より前を後ろから探し、
 * 直前に見せたほうへ帰す。前に無ければ後ろも含めて探す（順番を入れ替えた直後など）。
 *
 * @param stepContentIds 有効なステップのコンテンツID（表示順）
 * @param fromIndex      分岐画面自身の位置
 * @param targetId       戻り先のコンテンツID
 * @returns ステップ番号。見つからなければ -1
 */
export function findBranchTarget(
  stepContentIds: string[],
  fromIndex: number,
  targetId: string | null | undefined
): number {
  if (!targetId) return -1;
  for (let i = Math.min(fromIndex, stepContentIds.length) - 1; i >= 0; i--) {
    if (stepContentIds[i] === targetId) return i;
  }
  const anywhere = stepContentIds.indexOf(targetId);
  // 自分自身に戻すと抜けられなくなるので、それだけは無効にする
  return anywhere === fromIndex ? -1 : anywhere;
}
