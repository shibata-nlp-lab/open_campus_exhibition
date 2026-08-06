import type { KeyboardEvent } from 'react';

/**
 * 日本語入力の「変換確定」の Enter を、実行の Enter と区別する。
 *
 * IME で変換中に Enter を押すと keydown が飛んでくるが、これは確定操作であって
 * 送信の意図ではない。composing 中かどうかで判定する（keyCode 229 は古い環境向けの保険）。
 */
export function isSubmitEnter(e: KeyboardEvent<HTMLElement>): boolean {
  if (e.key !== 'Enter') return false;
  if (e.nativeEvent.isComposing) return false;
  if ((e.nativeEvent as unknown as { keyCode?: number }).keyCode === 229) return false;
  return true;
}
