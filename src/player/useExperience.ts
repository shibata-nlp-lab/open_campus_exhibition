import { useEffect, useRef } from 'react';
import type { ExperienceState } from '../types';
import { api } from '../lib/api';

/** コントローラからの操作を受ける口。体験①②で使うものだけ実装すればよい */
export interface ExperienceHandlers {
  /** 入力欄に文を入れる（実行はしない） */
  setText: (text: string) => void;
  /** その画面の主ボタン相当 */
  run: () => void;
  /** 体験①：フォーカスする単語を変える */
  focus?: (index: number) => void;
  /** 体験②：次の単語を選ぶ */
  pick?: (index: number) => void;
  /** 入力画面からやり直す */
  reset: () => void;
}

/**
 * 体験の画面をコントローラから操作できるようにする。
 *
 * - いまの様子（入力文・単語・候補）をコントローラへ配信する
 * - コントローラから届いた操作を、来場者が画面を触ったときと同じ処理に流す
 *
 * 進行係が手元で操作しても、来場者が画面を触っても同じ状態が動くので、
 * 「説明しながら進める」「来場者に触らせる」のどちらでも同じ画面で回せる。
 */
export function useExperienceControl(
  state: ExperienceState,
  handlers: ExperienceHandlers,
  report: ((state: ExperienceState | null) => void) | undefined
) {
  // 毎レンダー作り直される関数を購読の依存に入れると、その都度張り直しになる
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    return api.playback.onCommand((cmd) => {
      if (cmd.type === 'expText') ref.current.setText(cmd.text);
      else if (cmd.type === 'expRun') ref.current.run();
      else if (cmd.type === 'expFocus') ref.current.focus?.(cmd.index);
      else if (cmd.type === 'expPick') ref.current.pick?.(cmd.index);
      else if (cmd.type === 'expReset') ref.current.reset();
    });
  }, []);

  // 中身が変わったときだけ送る（毎レンダー送るとコントローラが描き直され続ける）
  const sentRef = useRef('');
  const json = JSON.stringify(state);
  useEffect(() => {
    if (json === sentRef.current) return;
    sentRef.current = json;
    report?.(JSON.parse(json) as ExperienceState);
  }, [json, report]);

  // 体験から離れたらコントローラの操作パネルも消す
  useEffect(() => () => report?.(null), [report]);
}
