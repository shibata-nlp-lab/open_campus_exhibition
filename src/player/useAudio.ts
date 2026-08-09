import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { AudioSetting } from '../types';
import { api } from '../lib/api';

/**
 * 進行画面全体の消音。設定画面から「🔇 音声を止めて開始」で開いたときに true になる。
 * 下見のときに音を出したくない（隣で別の説明をしている、深夜に確認している）ため。
 */
export const MuteAllContext = createContext(false);

/**
 * コンテンツ表示中だけ鳴らす BGM / ナレーション。
 *
 * restartKey を渡すと、同じファイルを続けて指定していても頭から鳴らし直す。
 * 体験①・②のように 1 つのコンテンツの中で画面が変わるものは、これを渡さないと
 * 「前の画面で鳴り終わった」状態が残り、次の画面が音を待たずに進んでしまう。
 */
export function useAudio(setting: AudioSetting | undefined, mutedExternal?: boolean, restartKey?: unknown) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [mutedLocal, setMuted] = useState(false);
  const muteAll = useContext(MuteAllContext);
  // 外部（コントローラ）から制御される場合はそちらを優先する。
  // 全体消音は誰の指定よりも強い（下見中に鳴らさないための設定なので）
  const muted = muteAll || (mutedExternal ?? mutedLocal);
  // 生成した直後に反映するため、最新の値を ref でも持つ
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  /**
   * 鳴り終わったか。自動モードは「音声が終わってから N 秒」で次へ進むので、
   * 音声が無い・ループする・再生に失敗した場合は「終わっている」ものとして扱う
   * （そうしないと自動モードが止まってしまう）。
   */
  const [ended, setEnded] = useState(!setting?.src);

  useEffect(() => {
    if (!setting?.src) {
      setEnded(true);
      return;
    }
    setEnded(false);
    // この効果で作った <audio> がまだ現役かどうか。
    // 差し替えたあとに古い再生の結果が届いても、それで「鳴り終わった」ことにしない
    let current = true;
    const el = new Audio(api.asset.url(setting.src));
    el.volume = setting.volume;
    el.loop = setting.loop;
    // 下の効果は muted が変わったときだけ走るので、初回はここで反映しないと鳴ってしまう
    el.muted = mutedRef.current;
    // ループする音は終わりが来ないので、待たずに次へ進めてよいことにする
    if (setting.loop) setEnded(true);
    el.addEventListener('ended', () => {
      if (current) setEnded(true);
    });
    // 再生できなかったとき（対応していない形式など）に自動モードを止めない。
    // ただし、下の後始末で止めたことによる失敗（開発時の二重実行や画面の切り替え）は
    // 「鳴り終わった」ではないので無視する
    el.play().catch(() => {
      if (current) setEnded(true);
    });
    ref.current = el;
    return () => {
      current = false;
      el.pause();
      el.src = '';
      ref.current = null;
    };
  }, [setting?.src, setting?.volume, setting?.loop, restartKey]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  return {
    hasAudio: Boolean(setting?.src),
    muted,
    ended,
    toggleMute: () => setMuted((m) => !m),
  };
}

/** ArrowRight/Space=次、ArrowLeft=前 をコンポーネント側で扱う */
export function useStepKeys(handlers: { next?: () => void; prev?: () => void; enabled?: boolean }) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ref.current.enabled === false) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        ref.current.next?.();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        ref.current.prev?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
