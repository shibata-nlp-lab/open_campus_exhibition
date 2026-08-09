import { createContext, useContext, useEffect, useRef } from 'react';

export interface AutoState {
  /** 自動モードで動いているか */
  auto: boolean;
  /** 自動モードをやめる（人が操作を引き取るとき） */
  cancel: () => void;
  /** 待機画面へ移る（自動モードで分岐に誰も反応しなかったとき） */
  toStandby: () => void;
}

export const AutoContext = createContext<AutoState>({ auto: false, cancel: () => {}, toStandby: () => {} });

export const useAuto = () => useContext(AutoContext);

/**
 * 自動モードのときだけ、**音声が鳴り終わってから** sec 秒後に fire を呼ぶ。
 * 音声が無い画面は「画面が出てから」sec 秒で呼ぶ（useAudio が ended=true を返すため）。
 *
 * key を変えるとタイマーを引き直す。同じ画面の中で段階が進むもの
 * （体験①のフォーカス移動、体験②の1語ずつの選択）で使う。
 */
export function useAutoTimer(opts: {
  enabled: boolean;
  /** 音声が鳴り終わったか。音声が無ければ true */
  audioEnded: boolean;
  sec: number | undefined;
  /** 変わるとタイマーを引き直す目印 */
  key?: unknown;
  fire: () => void;
}) {
  const { enabled, audioEnded, sec, key } = opts;
  // fire は毎レンダー作り直される関数のことが多いので、ref 経由で最新を呼ぶ。
  // 依存に入れるとタイマーが張り直され、いつまでも発火しない
  const fireRef = useRef(opts.fire);
  fireRef.current = opts.fire;

  useEffect(() => {
    if (!enabled || !audioEnded) return;
    const ms = Math.max(0, sec ?? 0) * 1000;
    const t = window.setTimeout(() => fireRef.current(), ms);
    return () => window.clearTimeout(t);
  }, [enabled, audioEnded, sec, key]);
}
