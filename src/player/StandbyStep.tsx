import { useEffect, useState } from 'react';
import type { StandbyContent } from '../types';
import type { StepProps } from './PlayerApp';
import { useAudio } from './useAudio';

/** 開始時刻までの残り時間（分）。過ぎていたら null */
function minutesUntil(hhmm: string, now: Date): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const target = new Date(now);
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 60000);
  return diff >= 0 ? diff : null;
}

/** 待機画面の中身。シナリオのステップとしても、オーバーレイとしても使う */
export function StandbyView({
  content,
  onFinish,
  overlay = false,
  muted = false,
}: {
  content: StandbyContent;
  onFinish: () => void;
  overlay?: boolean;
  /** BGM のミュート状態（コントローラ側から制御する） */
  muted?: boolean;
}) {
  useAudio(content.audio, muted);
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
  const mode = content.nextStartMode ?? 'hidden';
  const until = mode === 'time' ? minutesUntil(content.nextStartTime ?? '', now) : null;

  return (
    <div className={`standby ${overlay ? 'overlay' : ''}`}>
      <div className="standby-dots">
        <i /><i /><i />
      </div>
      <h1 className="standby-msg">{content.message}</h1>
      {content.submessage && <p className="standby-sub">{content.submessage}</p>}

      <div className="standby-times">
        {content.showClock && (
          <div className="standby-time">
            <span className="standby-time-label">ただいまの時刻</span>
            <span className="standby-time-value mono">
              {hh}:{mm}
            </span>
          </div>
        )}
        {mode !== 'hidden' && (
          <div className="standby-time next">
            <span className="standby-time-label">次の回のはじまり</span>
            <span className="standby-time-value mono">
              {mode === 'undecided' ? '未定' : (content.nextStartTime || '未定')}
            </span>
            {mode === 'time' && until !== null && (
              <span className="standby-time-sub">{until === 0 ? 'まもなく' : `あと約 ${until} 分`}</span>
            )}
          </div>
        )}
      </div>

      {content.autoAdvanceSec > 0 && (
        <div className="standby-count small muted">あと {left} 秒ではじまります</div>
      )}

      <div className="standby-actions">
        <button className="btn primary lg" onClick={onFinish}>
          {overlay ? '再開する ▶' : 'はじめる ▶'}
        </button>
      </div>
    </div>
  );
}

export default function StandbyStep({
  content,
  onFinish,
  standbyMuted,
}: StepProps<StandbyContent> & { standbyMuted?: boolean }) {
  return <StandbyView content={content} onFinish={onFinish} muted={standbyMuted} />;
}
