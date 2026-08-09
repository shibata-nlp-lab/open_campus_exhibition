import { useEffect, useRef, useState } from 'react';
import type { CueSound } from '../types';
import { api } from '../lib/api';

/**
 * ポン出し（コントローラのボタンで手動再生する音）。
 *
 * コンテンツの音声とは別の <audio> で鳴らすので、ナレーションに**重ねて**出せる。
 * 拍手・ジングル・効果音のように「進行を止めずに足す」使い方を想定している。
 * 同時に鳴らすのは1つだけ（次を鳴らすと前のものは止まる）。
 */
export function useCue(cues: CueSound[], muted: boolean) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const stop = () => {
    ref.current?.pause();
    if (ref.current) ref.current.src = '';
    ref.current = null;
    setPlaying(null);
  };

  /** 同じ id をもう一度渡すと止まる（ループ BGM を戻せるように） */
  const play = (id: string) => {
    const cue = cues.find((c) => c.id === id);
    stop();
    if (!cue?.src || playing === id) return;
    const el = new Audio(api.asset.url(cue.src));
    el.volume = cue.volume;
    el.loop = cue.loop;
    el.muted = muted;
    el.addEventListener('ended', () => setPlaying(null));
    el.play().catch(() => setPlaying(null));
    ref.current = el;
    setPlaying(id);
  };

  // 全体消音に追従する（下見のときにポン出しだけ鳴ってしまわないように）
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  // 画面を閉じるときに鳴りっぱなしにしない
  useEffect(() => () => stop(), []);

  return { playing, play, stop };
}
