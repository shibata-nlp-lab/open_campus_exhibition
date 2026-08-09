import { useEffect, useState } from 'react';
import type { AppConfig, DisplayInfo, PlaybackState } from '../types';
import { CONTENT_LABELS } from '../defaults';
import { api } from '../lib/api';
import AttributePanel from './AttributePanel';
import ExperiencePanel from './ExperiencePanel';
import NextStartPanel from './NextStartPanel';

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

  /*
   * 時刻や属性を打ち込んでいる間は、メインプロセス側のショートカット横取りを止める。
   * （そうしないと "n" や "s" がそのまま進行操作になってしまう）
   */
  useEffect(() => {
    const isField = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
    };
    const onIn = (e: FocusEvent) => api.controller.setTyping(isField(e.target));
    const onOut = () => api.controller.setTyping(false);
    window.addEventListener('focusin', onIn);
    window.addEventListener('focusout', onOut);
    return () => {
      window.removeEventListener('focusin', onIn);
      window.removeEventListener('focusout', onOut);
      api.controller.setTyping(false);
    };
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
  const bgmOn = Boolean(state.standbyAudio?.available) && !state.standbyAudio?.muted;
  const upcoming = state.steps[state.index + 1];
  /** 分岐画面から体験へ飛んでいる間の帰り先（飛んでいなければ undefined） */
  const returning = state.returnTo != null ? state.steps[state.returnTo] : undefined;

  return (
    <div className="controller">
      <header className="ctrl-head">
        <div>
          <div className="small muted">{state.scenarioName}</div>
          <h1>{current?.name ?? '—'}</h1>
          {state.standby && <span className="chip" style={{ background: '#37291a', color: '#ffd9a1' }}>待機画面を表示中</span>}
          {state.auto && (
            <span className="chip" title="A キーで解除できます" style={{ background: '#12301f', color: '#9ff0c4' }}>
              ⏩ 自動モード（A で解除）
            </span>
          )}
          {/* 音が出ないのを不具合と勘違いさせないため、止めている間は必ず出す */}
          {state.muteAll && (
            <span
              className="chip"
              title="M キーで元に戻せます"
              style={{ background: '#37291a', color: '#ffd9a1' }}
            >
              🔇 音声を停止中（M で再開）
            </span>
          )}
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
        {returning ? (
          // 分岐画面から飛んできている間は、順番どおりの「次」ではなく分岐画面に帰る。
          // 何も出さないと進行係には戻る理由が分からないので、ここで理由ごと出す
          <>↩ 体験に戻っています — 「次へ」で「{returning.name}」に帰ります</>
        ) : (
          <>
            次のコンテンツ：{upcoming ? `${upcoming.name}（${CONTENT_LABELS[upcoming.type]}）` : '（これが最後です）'}
            {upcoming?.note ? ` / メモ：${upcoming.note}` : ''}
          </>
        )}
      </div>

      {/*
        自動モード中は進行の操作を受け付けない。うっかり触って自動送りと二重に進むのを防ぐ。
        解除だけはここからできる（キーボードの A でも同じ）。
      */}
      {state.auto && (
        <div className="ctrl-buttons" style={{ marginBottom: 12 }}>
          <button
            className="btn lg primary"
            style={{ flex: 1 }}
            onClick={() => api.playback.send({ type: 'auto', on: false })}
          >
            ⏹ 自動モードを解除して手動に戻す
          </button>
        </div>
      )}

      <div className="ctrl-buttons">
        <button
          className="btn lg"
          onClick={() => api.playback.send({ type: 'prev' })}
          disabled={state.auto || state.index === 0}
        >
          ◀ 前へ
        </button>
        {/* 最後まで行っていても押せる。そのときは待機画面に移る */}
        <button className="btn lg primary" onClick={() => api.playback.send({ type: 'next' })} disabled={state.auto}>
          {returning ? '体験を終える ▶' : state.index >= state.total - 1 ? '待機画面へ ▶' : '次へ ▶'}
        </button>
        <button className="btn lg" onClick={() => api.playback.send({ type: 'restart' })} disabled={state.auto}>
          ⟲ 最初から
        </button>
      </div>

      {/* 体験を出している間だけ現れる。進行の操作の次に使うものなので、ここに置く */}
      <ExperiencePanel state={state} />

      <section className={`standby-panel ${state.standby ? 'on' : ''}`}>
        <div className="row" style={{ marginBottom: 10 }}>
          <span className={`state-dot ${state.standby ? 'on' : ''}`} />
          <strong>{state.standby ? '待機画面を表示中' : '待機画面は出ていません'}</strong>
        </div>
        <button
          className={`btn lg ${state.standby ? '' : 'primary'}`}
          style={{ width: '100%', padding: '16px 0' }}
          disabled={state.auto}
          onClick={() => api.playback.send({ type: 'standby', on: !state.standby })}
        >
          {state.standby ? '待機画面を解除して再開 ▶' : '⏸ 待機画面を表示する'}
        </button>

        <div className="row" style={{ marginTop: 12 }}>
          <span className={`state-dot ${bgmOn ? 'on' : 'off'}`} />
          <span>
            BGM：<strong>{!state.standbyAudio?.available ? '音源なし' : bgmOn ? '再生中' : 'ミュート中'}</strong>
          </span>
          <div className="spacer" />
          <button
            className={`btn ${bgmOn ? '' : 'primary'}`}
            disabled={!state.standbyAudio?.available}
            onClick={() => api.playback.send({ type: 'standbyMute', muted: bgmOn })}
          >
            {bgmOn ? '🔇 BGMを止める' : '🔊 BGMを鳴らす'}
          </button>
        </div>
        {!state.standbyAudio?.available && (
          <div className="small muted" style={{ marginTop: 6 }}>
            待機画面のコンテンツに音声ファイルを設定すると操作できます。
          </div>
        )}

        <NextStartPanel config={config} state={state} />
      </section>

      {(config?.settings.cues?.length ?? 0) > 0 && (
        <section>
          <div className="ctrl-label">ポン出し（進行中の音に重ねて鳴らします）</div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {config!.settings.cues.map((cue) => {
              const on = state.cue === cue.id;
              return (
                <button
                  key={cue.id}
                  className={`btn ${on ? 'primary' : ''}`}
                  disabled={!cue.src}
                  title={cue.src ? (on ? 'もう一度押すと止まります' : '') : '音声ファイルが未設定です'}
                  onClick={() => api.playback.send({ type: 'cue', id: cue.id })}
                >
                  {on ? '⏹ ' : '🔔 '}
                  {cue.label || '（名前なし）'}
                </button>
              );
            })}
            <div className="spacer" />
            <button className="btn sm" disabled={!state.cue} onClick={() => api.playback.send({ type: 'cueStop' })}>
              ■ 止める
            </button>
          </div>
        </section>
      )}

      <AttributePanel config={config} state={state} />

      {(state.scenarios?.length ?? 0) > 1 && (
        <section>
          <div className="ctrl-label">シナリオを切り替える（最初から始まります）</div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {state.scenarios.map((s) => (
              <button
                key={s.id}
                className={`btn ${s.id === state.scenarioId ? 'primary' : ''}`}
                disabled={state.auto}
                onClick={() => api.playback.send({ type: 'scenario', id: s.id })}
              >
                {s.id === state.scenarioId ? '● ' : '▶ '}
                {s.name}
              </button>
            ))}
          </div>
          {state.standby && (
            <div className="small muted" style={{ marginTop: 6 }}>
              待機画面を出したままでも、ここから選べば本編に切り替わります。
            </div>
          )}
        </section>
      )}

      <section>
        <div className="ctrl-label">今のシナリオの中を移動</div>
        <div className="col" style={{ gap: 5 }}>
          {state.steps.map((s, i) => (
            <button
              key={s.id}
              className={`ctrl-step ${i === state.index ? 'active' : ''} ${i < state.index ? 'done' : ''}`}
              disabled={state.auto}
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
              ['M', '音声の停止 / 再開'],
              ['A', '自動モードの入り / 切り'],
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
