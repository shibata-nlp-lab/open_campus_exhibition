import { useEffect, useState } from 'react';
import type { PlaybackState } from '../types';
import { api } from '../lib/api';

/**
 * 体験①②を手元から操作するパネル。
 *
 * 進行係が説明しながら回すとき、来場者に代わって
 * 例文を選ぶ・その場で文を打つ・見せる単語を切り替える・次の単語を選ぶ、を行う。
 * 進行画面を触ったときとまったく同じ処理が動くので、途中で来場者に代わってもらえる。
 */
export default function ExperiencePanel({ state }: { state: PlaybackState }) {
  const exp = state.experience;
  const [draft, setDraft] = useState('');
  /** 入力欄を触っている間は進行画面側の文で上書きしない（打っている途中で戻されるため） */
  const [typing, setTyping] = useState(false);

  const text = exp?.text ?? '';
  useEffect(() => {
    if (!typing) setDraft(text);
  }, [text, typing]);

  if (!exp) return null;

  // 自動モード中は手を出せない（自動送りと二重に動くのを防ぐ）。読み込み中も同じ
  const locked = state.auto || exp.busy;
  const send = api.playback.send;
  const title = exp.kind === 'interactive1' ? '体験①（単語とベクトル）' : '体験②（次の単語の予測）';

  return (
    <section>
      <div className="ctrl-label">{title}の操作 — 押すと進行画面がそのまま動きます</div>

      {state.auto && (
        <div className="small muted" style={{ marginBottom: 6 }}>
          自動モード中は操作できません。上の「自動モードを解除」を押してください。
        </div>
      )}

      {/* 入力（例文 / その場で打つ）。始まってしまうと入力欄は出ないので入力段階だけ */}
      {exp.phase === 'input' && (
        <>
          {exp.examples.length > 0 && (
            <div className="row" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
              {exp.examples.map((ex) => (
                <button
                  key={ex}
                  className={`btn sm ${ex === exp.text ? 'primary' : ''}`}
                  disabled={locked}
                  onClick={() => send({ type: 'expText', text: ex })}
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
          <div className="row" style={{ marginBottom: 8 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="ここに打つと進行画面の入力欄にそのまま出ます"
              value={draft}
              // 読み込み中は無効にしない。打っている途中でフォーカスが外れてしまうため
              disabled={state.auto}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onChange={(e) => {
                setDraft(e.target.value);
                send({ type: 'expText', text: e.target.value });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) send({ type: 'expRun' });
              }}
            />
            <button
              className="btn sm"
              disabled={locked || !draft}
              onClick={() => {
                setDraft('');
                send({ type: 'expText', text: '' });
              }}
            >
              消す
            </button>
          </div>
        </>
      )}

      <div className="row" style={{ flexWrap: 'wrap' }}>
        {exp.runLabel && (
          <button
            className="btn primary"
            disabled={locked || !exp.text.trim()}
            onClick={() => send({ type: 'expRun' })}
          >
            {exp.busy ? '準備中…' : `${exp.runLabel} ▶`}
          </button>
        )}
        <div className="spacer" />
        <button className="btn sm" disabled={locked || exp.phase === 'input'} onClick={() => send({ type: 'expReset' })}>
          ⟲ 入力からやり直す
        </button>
      </div>

      {/* 体験①：ベクトル画面で見せる単語を切り替える */}
      {exp.kind === 'interactive1' && exp.phase === 'vectors' && exp.tokens.length > 0 && (
        <>
          <div className="ctrl-label" style={{ marginTop: 12 }}>
            見せる単語（進行画面のフォーカスが移ります）
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {exp.tokens.map((t, i) => (
              <button
                key={i}
                className={`btn sm ${i === exp.focus ? 'primary' : ''}`}
                disabled={locked}
                onClick={() => send({ type: 'expFocus', index: i })}
              >
                {t === ' ' ? '␣' : t}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 体験②：次の単語を選ぶ */}
      {exp.kind === 'interactive2' && exp.candidates.length > 0 && (
        <>
          <div className="ctrl-label" style={{ marginTop: 12 }}>
            次の単語を選ぶ（確率の高い順）
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {exp.candidates.map((c, i) => (
              <button
                key={i}
                className={`btn sm ${i === 0 ? 'primary' : ''}`}
                disabled={locked}
                title={i === 0 ? 'いちばん確率が高い候補です' : ''}
                onClick={() => send({ type: 'expPick', index: i })}
              >
                {c.token === ' ' ? '␣' : c.token.replace(/\n/g, '⏎')}
                <span className="small muted"> {(c.prob * 100).toFixed(1)}%</span>
              </button>
            ))}
          </div>
        </>
      )}

      {exp.kind === 'interactive2' && exp.phase !== 'input' && exp.candidates.length === 0 && !exp.busy && (
        <div className="small muted" style={{ marginTop: 8 }}>
          選べる候補がありません（決めた語数まで進んだか、1位を自動で選ぶ設定になっています）。
        </div>
      )}
    </section>
  );
}
