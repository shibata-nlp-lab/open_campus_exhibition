import { useEffect, useMemo, useState } from 'react';
import type { ResultRecord } from '../types';
import { api } from '../lib/api';

export default function ResultsPanel() {
  const [rows, setRows] = useState<ResultRecord[]>([]);
  const [kind, setKind] = useState<'all' | ResultRecord['kind']>('all');

  const load = () => api.results.list().then(setRows);
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => (kind === 'all' ? rows : rows.filter((r) => r.kind === kind)), [rows, kind]);

  /** アンケートの選択肢別集計 */
  const surveyTally = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (r.kind !== 'survey') continue;
      const p = r.payload as { answers?: Array<{ question: string; choice: string; count: number }> };
      for (const a of p.answers ?? []) {
        if (!map.has(a.question)) map.set(a.question, new Map());
        const m = map.get(a.question)!;
        m.set(a.choice, (m.get(a.choice) ?? 0) + a.count);
      }
    }
    return map;
  }, [rows]);

  return (
    <>
      <h2>集計結果</h2>
      <p className="lead">進行画面で記録されたクイズ・ゲーム・アンケート・証明書発行のログです。</p>

      <div className="row" style={{ marginBottom: 14 }}>
        <select className="select" style={{ width: 200 }} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="all">すべて</option>
          <option value="quiz">クイズ</option>
          <option value="game">ゲーム</option>
          <option value="survey">アンケート</option>
        </select>
        <button className="btn sm" onClick={load}>更新</button>
        <button className="btn sm" onClick={() => api.results.exportCsv()}>CSV書き出し</button>
        <div className="spacer" />
        <span className="small muted">{rows.length} 件</span>
      </div>

      {surveyTally.size > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="small muted" style={{ marginBottom: 10 }}>アンケート集計</div>
          {[...surveyTally.entries()].map(([q, m]) => {
            const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
            return (
              <div key={q} style={{ marginBottom: 14 }}>
                <div style={{ marginBottom: 6 }}>{q}</div>
                {[...m.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                  <div key={c} className="row small" style={{ marginBottom: 3 }}>
                    <div style={{ width: 220 }}>{c}</div>
                    <div style={{ flex: 1, background: '#16203a', borderRadius: 4, height: 10 }}>
                      <div style={{ width: `${(n / total) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                    </div>
                    <div style={{ width: 60, textAlign: 'right' }}>{n} 人</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 160 }}>日時</th>
            <th style={{ width: 90 }}>種別</th>
            <th>内容</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice().reverse().slice(0, 300).map((r, i) => (
            <tr key={i}>
              <td className="mono small">{new Date(r.ts).toLocaleString()}</td>
              <td>{r.kind}</td>
              <td className="mono small" style={{ wordBreak: 'break-all' }}>{JSON.stringify(r.payload)}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={3} className="muted small" style={{ padding: 20 }}>まだ記録がありません。</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
