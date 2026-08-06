import { useEffect, useState } from 'react';
import type { AppConfig, NextStartMode, PlaybackState, StandbyContent } from '../types';
import { api } from '../lib/api';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** いまから n 分後の時刻（秒は切り捨て） */
const inMinutes = (n: number) => hhmm(new Date(Date.now() + n * 60_000));

/**
 * 待機画面に出す「次の回のはじまり」を進行中に書き換えるパネル。
 * 設定画面を開かなくても当日その場で変更できるようにするためのもの。
 * 変更は config.json に保存されるので、次に立ち上げ直しても残る。
 */
export default function NextStartPanel({ config, state }: { config: AppConfig | null; state: PlaybackState }) {
  const next = state.standbyNext;
  const target = config?.contents.find(
    (c): c is StandbyContent => c.type === 'standby' && c.id === next?.contentId
  );

  const [mode, setMode] = useState<NextStartMode>(next?.mode ?? 'hidden');
  const [time, setTime] = useState(next?.time ?? '');

  // 進行画面から届く現在値に追従する（設定画面で書き換えられた場合も拾う）
  useEffect(() => {
    setMode(next?.mode ?? 'hidden');
    setTime(next?.time ?? '');
  }, [next?.contentId, next?.mode, next?.time]);

  if (!config || !next) return null;

  const apply = (nextMode: NextStartMode, nextTime: string) => {
    setMode(nextMode);
    setTime(nextTime);
    if (!target) return;
    const updated: AppConfig = {
      ...config,
      contents: config.contents.map((c) =>
        c.id === target.id ? { ...(c as StandbyContent), nextStartMode: nextMode, nextStartTime: nextTime } : c
      ),
    };
    api.config.save(updated);
  };

  return (
    <div className="next-start">
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="small muted">次の回のはじまり（待機画面の表示）</span>
        <div className="spacer" />
        <span className="chip">
          {mode === 'hidden' ? '表示しない' : mode === 'undecided' ? '未定' : time || '未設定'}
        </span>
      </div>

      {target ? (
        <>
          <div className="row">
            <select
              className="select"
              style={{ width: 150 }}
              value={mode}
              onChange={(e) => apply(e.target.value as NextStartMode, time)}
            >
              <option value="hidden">表示しない</option>
              <option value="undecided">「未定」と表示</option>
              <option value="time">時刻を表示</option>
            </select>
            <input
              className="input"
              style={{ width: 120 }}
              type="time"
              value={time}
              disabled={mode !== 'time'}
              onChange={(e) => apply('time', e.target.value)}
            />
          </div>
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            {[5, 10, 15, 20, 30].map((m) => (
              <button key={m} className="btn sm" onClick={() => apply('time', inMinutes(m))}>
                {m}分後
              </button>
            ))}
            <button className="btn sm" onClick={() => apply('undecided', time)}>
              未定にする
            </button>
          </div>
        </>
      ) : (
        <div className="small muted">
          設定画面で「待機画面」のコンテンツを追加すると、ここから開始時刻を変更できます。
        </div>
      )}
    </div>
  );
}
