import { useEffect, useMemo, useState } from 'react';
import type { AppConfig, AttributePayload, PlaybackState } from '../types';
import { DEFAULT_ATTRIBUTE_OPTIONS } from '../defaults';
import { api } from '../lib/api';

/**
 * 来場グループの内訳を進行係が手元で記録するパネル。
 * 進行画面のアンケート（来場者が自分で押すもの）とは別に、
 * 「高校2年が3人、保護者が1人」といった属性を人数つきで残せるようにする。
 */
export default function AttributePanel({ config, state }: { config: AppConfig | null; state: PlaybackState }) {
  const options = useMemo(() => {
    const o = config?.settings.attributeOptions;
    return o && o.length > 0 ? o : DEFAULT_ATTRIBUTE_OPTIONS;
  }, [config]);

  const [counts, setCounts] = useState<number[]>(() => new Array(options.length).fill(0));
  const [memo, setMemo] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  // 区分を設定画面で増減した場合に長さを合わせる（入力済みの数はできるだけ残す）
  useEffect(() => {
    setCounts((prev) => options.map((_, i) => prev[i] ?? 0));
  }, [options]);

  const people = counts.reduce((a, b) => a + b, 0);
  const current = state.steps[state.index];

  const bump = (i: number, d: number) =>
    setCounts((prev) => prev.map((n, j) => (j === i ? Math.max(0, n + d) : n)));

  const submit = () => {
    if (people === 0) return;
    const payload: AttributePayload = {
      counts: Object.fromEntries(options.map((label, i) => [label, counts[i]]).filter(([, n]) => (n as number) > 0)),
      people,
      memo: memo.trim(),
    };
    api.results.append({
      ts: new Date().toISOString(),
      scenarioId: null,
      contentId: current?.id ?? 'controller',
      kind: 'attribute',
      payload,
    });
    setCounts(new Array(options.length).fill(0));
    setMemo('');
    setSaved(`${people} 人ぶんを記録しました（${new Date().toLocaleTimeString()}）`);
  };

  return (
    <section className="attr-panel">
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="ctrl-label" style={{ margin: 0 }}>
          来場者の内訳を記録
        </div>
        <div className="spacer" />
        <span className="attr-total">
          合計 <strong>{people}</strong> 人
        </span>
      </div>

      <div className="attr-grid">
        {options.map((label, i) => (
          <div className={`attr-item ${counts[i] > 0 ? 'on' : ''}`} key={label}>
            <span className="attr-label">{label}</span>
            <div className="row">
              <button className="btn sm" onClick={() => bump(i, -1)} disabled={(counts[i] ?? 0) === 0}>
                −
              </button>
              <span className="attr-count mono">{counts[i] ?? 0}</span>
              <button className="btn sm" onClick={() => bump(i, 1)}>
                ＋
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="メモ（例：〇〇高校の団体、引率あり）"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        <button className="btn primary" onClick={submit} disabled={people === 0}>
          記録する
        </button>
        <button
          className="btn sm"
          onClick={() => {
            setCounts(new Array(options.length).fill(0));
            setMemo('');
          }}
          disabled={people === 0 && memo === ''}
        >
          クリア
        </button>
      </div>

      {saved && (
        <div className="small" style={{ marginTop: 6, color: 'var(--ok, #7fd18a)' }}>
          ✓ {saved}
        </div>
      )}
      <div className="small muted" style={{ marginTop: 4 }}>
        区分は設定画面の「全般」で変更できます。記録は設定画面の「集計結果」で確認・書き出しできます。
      </div>
    </section>
  );
}
