import { useEffect, useState } from 'react';
import type { StandbyContent } from '../types';
import type { StepProps } from './PlayerApp';
import { useAudio } from './useAudio';

/** 待機画面の中身。シナリオのステップとしても、オーバーレイとしても使う */
export function StandbyView({
  content,
  onFinish,
  overlay = false,
}: {
  content: StandbyContent;
  onFinish: () => void;
  overlay?: boolean;
}) {
  const audio = useAudio(content.audio);
  const [now, setNow] = useState(new Date());
  const [left, setLeft] = useState(content.autoAdvanceSec);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!content.autoAdvanceSec) return;
    setLeft(content.autoAdvanceSec);
    const started = Date.now();
    const t = window.setInterval(() => {
      const rest = content.autoAdvanceSec - Math.floor((Date.now() - started) / 1000);
      if (rest <= 0) {
        window.clearInterval(t);
        setLeft(0);
        onFinish();
      } else setLeft(rest);
    }, 250);
    return () => window.clearInterval(t);
  }, [content.autoAdvanceSec]);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  return (
    <div className={`standby ${overlay ? 'overlay' : ''}`}>
      <div className="standby-dots">
        <i /><i /><i />
      </div>
      <h1 className="standby-msg">{content.message}</h1>
      {content.submessage && <p className="standby-sub">{content.submessage}</p>}
      {content.showClock && <div className="standby-clock mono">{hh}:{mm}</div>}
      {content.autoAdvanceSec > 0 && (
        <div className="standby-count small muted">あと {left} 秒ではじまります</div>
      )}
      <div className="standby-actions">
        {audio.hasAudio && (
          <button className="btn" onClick={audio.toggleMute}>
            {audio.muted ? '🔇 BGMオフ' : '🔊 BGMオン'}
          </button>
        )}
        <button className="btn primary lg" onClick={onFinish}>
          {overlay ? '再開する ▶' : 'はじめる ▶'}
        </button>
      </div>
    </div>
  );
}

export default function StandbyStep({ content, onFinish }: StepProps<StandbyContent>) {
  return <StandbyView content={content} onFinish={onFinish} />;
}
