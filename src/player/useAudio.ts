import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { AudioSetting } from '../types';
import { api } from '../lib/api';

/**
 * 進行画面全体の消音。設定画面から「🔇 音声を止めて開始」で開いたときに true になる。
 * 下見のときに音を出したくない（隣で別の説明をしている、深夜に確認している）ため。
 */
export const MuteAllContext = createContext(false);

/** コンテンツ表示中だけ鳴らす BGM / ナレーション */
export function useAudio(setting: AudioSetting | undefined, mutedExternal?: boolean) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [mutedLocal, setMuted] = useState(false);
  const muteAll = useContext(MuteAllContext);
  // 外部（コントローラ）から制御される場合はそちらを優先する。
  // 全体消音は誰の指定よりも強い（下見中に鳴らさないための設定なので）
  const muted = muteAll || (mutedExternal ?? mutedLocal);
  // 生成した直後に反映するため、最新の値を ref でも持つ
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    if (!setting?.src) return;
    const el = new Audio(api.asset.url(setting.src));
    el.volume = setting.volume;
    el.loop = setting.loop;
    // 下の効果は muted が変わったときだけ走るので、初回はここで反映しないと鳴ってしまう
    el.muted = mutedRef.current;
    el.play().catch(() => {});
    ref.current = el;
    return () => {
      el.pause();
      el.src = '';
      ref.current = null;
    };
  }, [setting?.src, setting?.volume, setting?.loop]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  return {
    hasAudio: Boolean(setting?.src),
    muted,
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
