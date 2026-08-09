import { useState } from 'react';
import type { SurveyContent } from '../types';
import type { StepProps } from './PlayerApp';
import { useAudio } from './useAudio';
import { useAuto, useAutoTimer } from './useAuto';

const SCALE = ['とても良い', '良い', 'ふつう', 'いまいち', '良くない'];

export default function SurveyStep({ content, onFinish, record }: StepProps<SurveyContent>) {
  const audio = useAudio(content.audio);
  // 自動モードは人数を数える人がいないので、音声を流し終えたら先へ進む
  const { auto } = useAuto();
  useAutoTimer({ enabled: auto, audioEnded: audio.ended, sec: content.autoSec, fire: onFinish });
  const [people, setPeople] = useState(content.defaultPeople);
  const [qi, setQi] = useState(0);
  const [counts, setCounts] = useState<Record<string, number[]>>({});
  const [done, setDone] = useState(false);

  const q = content.questions[qi];
  if (!q) {
    return (
      <div className="stage">
        <h1>設問が登録されていません</h1>
        <button className="btn lg primary" onClick={onFinish}>次へ</button>
      </div>
    );
  }

  const choices = q.kind === 'scale' ? SCALE : q.choices.filter((c) => c.trim() !== '');
  const cur = counts[q.id] ?? new Array(choices.length).fill(0);
  const total = cur.reduce((a, b) => a + b, 0);

  const bump = (i: number, d: number) => {
    setCounts((prev) => {
      const arr = [...(prev[q.id] ?? new Array(choices.length).fill(0))];
      arr[i] = Math.max(0, Math.min(people, arr[i] + d));
      return { ...prev, [q.id]: arr };
    });
  };

  const advance = () => {
    if (qi + 1 < content.questions.length) {
      setQi(qi + 1);
      return;
    }
    // 記録
    const answers: Array<{ question: string; choice: string; count: number }> = [];
    for (const question of content.questions) {
      const cs = question.kind === 'scale' ? SCALE : question.choices.filter((c) => c.trim() !== '');
      const arr = counts[question.id] ?? [];
      cs.forEach((c, i) => {
        if ((arr[i] ?? 0) > 0) answers.push({ question: question.text, choice: c, count: arr[i] });
      });
    }
    record('survey', { people, answers });
    setDone(true);
  };

  if (done) {
    return (
      <div className="stage fade-in">
        <h1>ご協力ありがとうございました！</h1>
        <p className="lead">いただいた回答は展示の改善に使わせていただきます。</p>
        <button className="btn lg primary" onClick={onFinish}>次へすすむ ▶</button>
      </div>
    );
  }

  return (
    <div className="stage">
      <div className="row">
        <span className="chip">アンケート {qi + 1} / {content.questions.length}</span>
        {audio.hasAudio && <button className="btn sm ghost" onClick={audio.toggleMute}>{audio.muted ? '🔇' : '🔊'}</button>}
      </div>

      <div className="people-ctrl">
        <span className="small muted">回答する人数</span>
        <button onClick={() => setPeople((p) => Math.max(1, p - 1))}>−</button>
        <span style={{ minWidth: 90, textAlign: 'center', fontSize: 30, fontWeight: 700 }}>{people} 人</span>
        <button onClick={() => setPeople((p) => Math.min(50, p + 1))}>＋</button>
      </div>

      <h1>{q.text}</h1>

      <div className="col" style={{ width: 'min(820px, 92vw)' }}>
        {choices.map((c, i) => (
          <div className="counter" key={i}>
            <span>{c}</span>
            <div className="row">
              <button className="btn" onClick={() => bump(i, -1)} disabled={(cur[i] ?? 0) === 0}>−</button>
              <span className="num">{cur[i] ?? 0}</span>
              <button className="btn" onClick={() => bump(i, 1)} disabled={total >= people}>＋</button>
            </div>
          </div>
        ))}
      </div>

      <p className="small muted">
        {total} / {people} 人ぶん入力済み
      </p>

      <div className="row">
        <button className="btn lg" onClick={() => (qi > 0 ? setQi(qi - 1) : undefined)} disabled={qi === 0}>
          ◀ 前の設問
        </button>
        <button className="btn lg primary" onClick={advance}>
          {qi + 1 < content.questions.length ? '次の設問 ▶' : '回答を送信 ▶'}
        </button>
      </div>
    </div>
  );
}
