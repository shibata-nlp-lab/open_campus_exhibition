import { useContext, useEffect, useRef, useState } from 'react';
import type { VideoContent } from '../types';
import type { StepProps } from './PlayerApp';
import { api } from '../lib/api';
import { MuteAllContext } from './useAudio';

export default function VideoStep({ content, onFinish }: StepProps<VideoContent>) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [mutedLocal, setMuted] = useState(content.muted);
  const [playing, setPlaying] = useState(true);
  // 全体消音のときは動画の音も止める（下見で音を出さないための設定なので）
  const muteAll = useContext(MuteAllContext);
  const muted = muteAll || mutedLocal;

  useEffect(() => {
    ref.current?.play().catch(() => setPlaying(false));
  }, []);

  if (!content.src) {
    return (
      <div className="stage">
        <h1>動画が未設定です</h1>
        <p className="lead">設定画面 →「コンテンツ」から動画ファイルを選択してください。</p>
        <button className="btn lg primary" onClick={onFinish}>次へ</button>
      </div>
    );
  }

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
      <video
        ref={ref}
        src={api.asset.url(content.src)}
        muted={muted}
        loop={content.loop}
        onEnded={() => content.autoAdvance && !content.loop && onFinish()}
        onClick={toggle}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
      <div
        style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 12, background: 'rgba(10,15,26,.82)', padding: '10px 14px', borderRadius: 14,
        }}
      >
        <button className="btn" onClick={toggle}>{playing ? '⏸ 一時停止' : '▶ 再生'}</button>
        <button className="btn" onClick={() => setMuted((m) => !m)}>{muted ? '🔇 音声オフ' : '🔊 音声オン'}</button>
        <button className="btn primary" onClick={onFinish}>次へ ▶</button>
      </div>
    </div>
  );
}
