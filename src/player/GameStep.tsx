import { useEffect, useState } from 'react';
import type { GameContent } from '../types';
import type { StepProps } from './PlayerApp';
import { useAuto, useAutoTimer } from './useAuto';

export default function GameStep({ content, onFinish, record }: StepProps<GameContent>) {
  // 自動モードは来場者が答えないので、待ち時間ぶんだけ見せて先へ進む（音声は持っていない）
  const { auto } = useAuto();
  useAutoTimer({ enabled: auto, audioEnded: true, sec: content.autoSec, fire: onFinish });
  const [phase, setPhase] = useState<'title' | 'play' | 'result'>('title');
  const [ri, setRi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [left, setLeft] = useState(content.timeLimitSec);

  const round = content.rounds[ri];

  useEffect(() => {
    if (phase !== 'play' || picked !== null || !content.timeLimitSec) return;
    setLeft(content.timeLimitSec);
    const started = Date.now();
    const t = window.setInterval(() => {
      const rest = content.timeLimitSec - (Date.now() - started) / 1000;
      if (rest <= 0) {
        window.clearInterval(t);
        setLeft(0);
        setPicked(-1);
      } else setLeft(rest);
    }, 100);
    return () => window.clearInterval(t);
  }, [phase, ri, picked, content.timeLimitSec]);

  if (!round) {
    return (
      <div className="stage">
        <h1>問題が登録されていません</h1>
        <button className="btn lg primary" onClick={onFinish}>次へ</button>
      </div>
    );
  }

  if (phase === 'title') {
    return (
      <div className="stage">
        <span className="chip">ゲーム</span>
        <h1>次の単語当てゲーム</h1>
        <p className="lead">
          LLMになったつもりで、「次に来ることば」を当ててみよう。<br />
          全 {content.rounds.length} 問・1問 {content.timeLimitSec > 0 ? `${content.timeLimitSec}秒` : '時間無制限'}
        </p>
        <button className="btn lg primary" onClick={() => setPhase('play')}>スタート ▶</button>
      </div>
    );
  }

  if (phase === 'result') {
    const full = correct === content.rounds.length;
    return (
      <div className="stage fade-in">
        <h1>{full ? '全問正解！🎉' : 'おつかれさま！'}</h1>
        <h2>
          {content.rounds.length} 問中 <span style={{ color: 'var(--accent-2)' }}>{correct}</span> 問正解 — {score} 点
        </h2>
        <p className="lead" style={{ maxWidth: 900 }}>
          みなさんが「次に来そうなことば」を選べたのと同じことを、LLMは膨大なデータから学んだ確率で行っています。
        </p>
        <button className="btn lg primary" onClick={onFinish}>次へすすむ ▶</button>
      </div>
    );
  }

  const answered = picked !== null;
  const choose = (i: number) => {
    if (answered) return;
    setPicked(i);
    const ok = i === round.answerIndex;
    if (ok) {
      setScore((s) => s + content.pointsPerCorrect);
      setCorrect((c) => c + 1);
    }
    record('game', { context: round.context, choice: round.choices[i]?.text ?? '', correct: ok });
  };

  const advance = () => {
    if (ri + 1 < content.rounds.length) {
      setRi(ri + 1);
      setPicked(null);
    } else {
      setPhase('result');
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {content.timeLimitSec > 0 && (
        <div className="timer-bar">
          <div style={{ width: `${(left / content.timeLimitSec) * 100}%` }} />
        </div>
      )}
      <div className="stage" style={{ flex: 1 }}>
        <div className="row">
          <span className="chip">第 {ri + 1} / {content.rounds.length} 問</span>
          <span className="chip">{score} 点</span>
          {content.timeLimitSec > 0 && !answered && <span className="chip">のこり {Math.ceil(left)} 秒</span>}
        </div>

        <p className="lead">次に来ることばは？</p>
        <h1>
          {round.context}
          <span style={{ color: 'var(--accent)', margin: '0 .2em' }}>___</span>
        </h1>

        <div className="choice-grid">
          {round.choices.map((c, i) => {
            const cls = !answered ? '' : i === round.answerIndex ? 'correct' : i === picked ? 'wrong' : '';
            return (
              <button key={i} className={`choice ${cls}`} onClick={() => choose(i)} disabled={answered}>
                {c.text}
                {answered && (
                  <>
                    <div className="pct">確率 {(c.prob * 100).toFixed(0)}%</div>
                    <div className="bar" style={{ width: `${Math.min(100, c.prob * 100)}%` }} />
                  </>
                )}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="fade-in col" style={{ alignItems: 'center', gap: 16 }}>
            <h2 style={{ color: picked === round.answerIndex ? 'var(--ok)' : 'var(--warn)' }}>
              {picked === round.answerIndex ? '正解！' : picked === -1 ? '時間切れ！' : 'ざんねん…'}
            </h2>
            {/* 解説は設定画面で入れた改行をそのまま出す（折り返しは通常どおり効く） */}
            {round.explanation && (
              <p className="lead" style={{ maxWidth: 900, whiteSpace: 'pre-wrap' }}>
                {round.explanation}
              </p>
            )}
            <button className="btn lg primary" onClick={advance}>
              {ri + 1 < content.rounds.length ? '次の問題 ▶' : '結果を見る ▶'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
