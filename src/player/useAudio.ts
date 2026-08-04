import { useEffect, useRef, useState } from 'react';
import type { AudioSetting } from '../types';
import { api } from '../lib/api';

/** コンテンツ表示中だけ鳴らす BGM / ナレーション */
export function useAudio(setting: AudioSetting | undefined) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!setting?.src) return;
    const el = new Audio(api.asset.url(setting.src));
    el.volume = setting.volume;
    el.loop = setting.loop;
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
