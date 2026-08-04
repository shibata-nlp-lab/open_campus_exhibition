import { useEffect, useState } from 'react';
import type { AppConfig, DisplayInfo, PlaybackState } from '../types';
import { CONTENT_LABELS } from '../defaults';
import { api } from '../lib/api';

/** 本体画面に出す進行コントローラ。進行画面（外部モニター）を手元から操作する */
export default function ControllerApp() {
  const [state, setState] = useState<PlaybackState | null>(null);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    api.playback.current().then((s) => s && setState(s));
    return api.playback.onState(setState);
  }, []);

  useEffect(() => {
    api.display.list().then(setDisplays);
    return api.display.onChanged(setDisplays);
  }, []);

  useEffect(() => {
    api.config.load().then(setConfig);
    return api.config.onChanged(setConfig);
  }, []);

  /*
   * キー操作の大半はメインプロセス側（before-input-event）で処理している。
   * レンダラ内のどこにフォーカスがあっても、IME が有効でも確実に効かせるため。
   * ここで扱うのは Space だけ（ボタンにフォーカスがあるときの二重発火を避ける必要があるため）。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON')) return;
      e.preventDefault();
      api.playback.send({ type: 'advance' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 経過時間（コンテンツが変わるとリセット）
  useEffect(() => {
    setElapsed(0);
    const t = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(t);
  }, [state?.index]);

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  if (!state) {
    return (
      <div className="controller">
        <div className="ctrl-empty">
          <div className="spin" />
          <p className="muted small">進行画面の準備を待っています…</p>
        </div>
      </div>
    );
  }

  const current = state.steps[state.index];
  const upcoming = state.steps[state.index + 1];

  return (
    <div className="controller">
      <header className="ctrl-head">
        <div>
          <div className="small muted">{state.scenarioName}</div>
          <h1>{current?.name ?? '—'}</h1>
          {state.standby && <span className="chip" style={{ background: '#37291a', color: '#ffd9a1' }}>待機画面を表示中</span>}
          <div className="small muted">
            {current ? CONTENT_LABELS[current.type] : ''}
            {state.detail ? ` — ${state.detail}` : ''}
          </div>
        </div>
        <div className="ctrl-clock">
          <div className="mono">{mmss}</div>
          <div className="small muted">
            {state.index + 1} / {state.total}
          </div>
        </div>
      </header>

      {current?.note && <div className="ctrl-note">📝 {current.note}</div>}

      <div className="ctrl-next small muted">
        次のコンテンツ：{upcoming ? `${upcoming.name}（${CONTENT_LABELS[upcoming.type]}）` : '（これが最後です）'}
        {upcoming?.note ? ` / メモ：${upcoming.note}` : ''}
      </div>

      <div className="ctrl-buttons">
        <button className="btn lg" onClick={() => api.playback.send({ type: 'prev' })} disabled={state.index === 0}>
          ◀ 前へ
        </button>
        <button
          className="btn lg primary"
          onClick={() => api.playback.send({ type: 'next' })}
          disabled={state.index >= state.total - 1}
        >
          次へ ▶
        </button>
        <button className="btn lg" onClick={() => api.playback.send({ type: 'restart' })}>
          ⟲ 最初から
        </button>
      </div>

      <button
        className={`btn lg ${state.standby ? 'primary' : ''}`}
        style={{ padding: '16px 0' }}
        onClick={() => api.playback.send({ type: 'standby', on: !state.standby })}
      >
        {state.standby ? '⏸ 待機画面を解除して再開' : '⏸ 待機画面を表示（お待ちください）'}
      </button>

      <section>
        <div className="ctrl-label">シナリオ（クリックで移動）</div>
        <div className="col" style={{ gap: 5 }}>
          {state.steps.map((s, i) => (
            <button
              key={s.id}
              className={`ctrl-step ${i === state.index ? 'active' : ''} ${i < state.index ? 'done' : ''}`}
              onClick={() => api.playback.send({ type: 'goto', index: i })}
            >
              <span className="step-idx">{i + 1}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                {s.name}
                {s.note && <span className="small muted"> — {s.note}</span>}
              </span>
              <span className="small muted">{CONTENT_LABELS[s.type]}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="ctrl-label">モニター</div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {displays.map((d) => (
            <button
              key={d.id}
              className={`btn sm ${d.isPlayer ? 'primary' : ''}`}
              onClick={() => api.display.movePlayer(d.id).then(setDisplays)}
              title="クリックで進行画面をこのモニターへ移動"
            >
              {d.label} {d.width}×{d.height}
              {d.isPrimary ? '（本体）' : ''}
              {d.isPlayer ? ' ← 表示中' : ''}
            </button>
          ))}
        </div>
        {displays.length < 2 && (
          <div className="small muted" style={{ marginTop: 6 }}>
            外部モニターが検出されていません。接続すると自動でこの一覧に追加されます。
          </div>
        )}
      </section>

      {config?.settings.showHints !== false && (
        <section>
          <div className="ctrl-label">キーボード操作（この画面・進行画面どちらがアクティブでも有効）</div>
          <div className="ctrl-keys">
            {[
              ['→ / Space', '次へ（スライド送り等）'],
              ['←', '戻る'],
              ['N / P', '次 / 前のコンテンツ'],
              ['S', '待機画面の表示 / 解除'],
              ['R', '最初から'],
              ['F', '全画面切替'],
              ['Esc', '終了'],
            ].map(([key, label]) => (
              <div key={key} className="ctrl-key">
                <kbd>{key}</kbd>
                <span className="small muted">{label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="ctrl-foot">
        <span className="small muted">Esc で展示を終了します</span>
        <div className="spacer" />
        <button className="btn sm danger" onClick={() => api.player.close()}>
          展示を終了
        </button>
      </footer>
    </div>
  );
}
