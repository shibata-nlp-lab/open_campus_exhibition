import { useEffect, useState } from 'react';
import type { QuizContent } from '../types';
import type { StepProps } from './PlayerApp';
import { api } from '../lib/api';
import { useAudio } from './useAudio';
import { useAuto, useAutoTimer } from './useAuto';

export default function QuizStep({ content, onFinish, record }: StepProps<QuizContent>) {
  const audio = useAudio(content.audio);
  // 自動モードは来場者が答えないので、音声を流し終えたら先へ進む
  const { auto } = useAuto();
  useAutoTimer({ enabled: auto, audioEnded: audio.ended, sec: content.autoSec, fire: onFinish });
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [left, setLeft] = useState(content.timeLimitSec);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  const q = content.questions[qi];

  // カウントダウン
  useEffect(() => {
    if (done || picked !== null || !content.timeLimitSec) return;
    setLeft(content.timeLimitSec);
    const started = Date.now();
    const t = window.setInterval(() => {
      const rest = content.timeLimitSec - (Date.now() - started) / 1000;
      if (rest <= 0) {
        window.clearInterval(t);
        setLeft(0);
        setPicked(-1); // 時間切れ
      } else setLeft(rest);
    }, 100);
    return () => window.clearInterval(t);
  }, [qi, done, picked, content.timeLimitSec]);

  if (!q) {
    return (
      <div className="stage">
        <h1>問題が登録されていません</h1>
        <button className="btn lg primary" onClick={onFinish}>次へ</button>
      </div>
    );
  }

  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const ok = i === q.answerIndex;
    if (ok) setCorrectCount((c) => c + 1);
    record('quiz', {
      question: q.text,
      choice: q.choices[i]?.text ?? '',
      correct: ok,
    });
  };

  const advance = () => {
    if (qi + 1 < content.questions.length) {
      setQi(qi + 1);
      setPicked(null);
    } else {
      setDone(true);
    }
  };

  if (done) {
    return (
      <div className="stage fade-in">
        <h1>けっか</h1>
        <h2>
          {content.questions.length} 問中 <span style={{ color: 'var(--accent-2)' }}>{correctCount}</span> 問 正解！
        </h2>
        <button className="btn lg primary" onClick={onFinish}>次へすすむ ▶</button>
      </div>
    );
  }

  const answered = picked !== null;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {content.timeLimitSec > 0 && (
        <div className="timer-bar">
          <div style={{ width: `${(left / content.timeLimitSec) * 100}%` }} />
        </div>
      )}
      <div className="stage" style={{ flex: 1 }}>
        <div className="row" style={{ gap: 12 }}>
          <span className="chip">クイズ {qi + 1} / {content.questions.length}</span>
          {content.timeLimitSec > 0 && !answered && <span className="chip">のこり {Math.ceil(left)} 秒</span>}
          {audio.hasAudio && (
            <button className="btn sm ghost" onClick={audio.toggleMute}>{audio.muted ? '🔇' : '🔊'}</button>
          )}
        </div>

        {/* 問題文も設定画面では複数行で書けるので、改行をそのまま出す */}
        <h1 style={{ whiteSpace: 'pre-wrap' }}>{q.text}</h1>
        {q.imageSrc && <img src={api.asset.url(q.imageSrc)} style={{ maxHeight: '28vh', borderRadius: 12 }} />}

        <div className="choice-grid">
          {q.choices.map((c, i) => {
            const cls = !answered
              ? ''
              : i === q.answerIndex
                ? 'correct'
                : i === picked
                  ? 'wrong'
                  : '';
            return (
              <button key={c.id} className={`choice ${cls}`} onClick={() => choose(i)} disabled={answered}>
                {c.text}
                {answered && i === q.answerIndex && <div className="pct">✅ 正解</div>}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="fade-in col" style={{ alignItems: 'center', gap: 18 }}>
            {picked === -1 && <h2 style={{ color: 'var(--warn)' }}>時間切れ！</h2>}
            {/* 解説は設定画面で入れた改行をそのまま出す（折り返しは通常どおり効く） */}
            {content.showExplanation && q.explanation && (
              <p className="lead" style={{ maxWidth: 900, whiteSpace: 'pre-wrap' }}>
                {q.explanation}
              </p>
            )}
            <button className="btn lg primary" onClick={advance}>
              {qi + 1 < content.questions.length ? '次の問題 ▶' : '結果を見る ▶'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
