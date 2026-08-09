import { useState } from 'react';
import type { AppConfig, Scenario } from '../types';
import { CONTENT_LABELS, uid } from '../defaults';
import { api } from '../lib/api';
import { PLAY_MODES } from '../playModes';
import { Field } from './common';

interface Props {
  config: AppConfig;
  update: (fn: (draft: AppConfig) => AppConfig) => void;
  flush: () => Promise<void>;
}

export default function ScenarioPanel({ config, update, flush }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    config.activeScenarioId ?? config.scenarios[0]?.id ?? null
  );
  const scenario = config.scenarios.find((s) => s.id === selectedId) ?? null;
  const [addPickerOpen, setAddPickerOpen] = useState(false);

  const patchScenario = (fn: (s: Scenario) => void) =>
    update((d) => {
      const s = d.scenarios.find((x) => x.id === selectedId);
      if (s) fn(s);
      return d;
    });

  const move = (index: number, delta: number) =>
    patchScenario((s) => {
      const j = index + delta;
      if (j < 0 || j >= s.steps.length) return;
      const [item] = s.steps.splice(index, 1);
      s.steps.splice(j, 0, item);
    });

  const usedIds = new Set(scenario?.steps.map((s) => s.contentId));
  const available = config.contents.filter((c) => !usedIds.has(c.id));

  return (
    <>
      <h2>シナリオ</h2>
      <p className="lead">コンテンツを並べて展示の流れを作ります。複数作って当日切り替えられます。</p>

      <div className="split">
        <div className="col">
          <div className="list">
            {config.scenarios.map((s) => (
              <div
                key={s.id}
                className={`list-item ${s.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(s.id)}
              >
                <div style={{ flex: 1 }}>
                  <div>{s.name}</div>
                  <div className="type">{s.steps.filter((x) => x.enabled).length} ステップ</div>
                </div>
                {config.activeScenarioId === s.id && <span className="chip">使用中</span>}
              </div>
            ))}
          </div>
          <div className="row">
            <button
              className="btn sm"
              onClick={() =>
                update((d) => {
                  const s: Scenario = { id: uid('sc'), name: '新しいシナリオ', description: '', steps: [] };
                  d.scenarios.push(s);
                  setSelectedId(s.id);
                  return d;
                })
              }
            >
              ＋ シナリオ追加
            </button>
            {scenario && (
              <button
                className="btn sm"
                onClick={() =>
                  update((d) => {
                    const src = d.scenarios.find((x) => x.id === selectedId)!;
                    const copy: Scenario = {
                      ...structuredClone(src),
                      id: uid('sc'),
                      name: src.name + ' のコピー',
                      steps: src.steps.map((st) => ({ ...st, id: uid('st') })),
                    };
                    d.scenarios.push(copy);
                    setSelectedId(copy.id);
                    return d;
                  })
                }
              >
                複製
              </button>
            )}
          </div>
        </div>

        {scenario ? (
          <div className="card">
            <div className="row" style={{ marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <Field label="シナリオ名">
                  <input
                    className="input"
                    value={scenario.name}
                    onChange={(e) => patchScenario((s) => void (s.name = e.target.value))}
                  />
                </Field>
                <Field label="説明">
                  <input
                    className="input"
                    value={scenario.description}
                    onChange={(e) => patchScenario((s) => void (s.description = e.target.value))}
                  />
                </Field>
              </div>
            </div>

            <div className="row" style={{ marginBottom: 12 }}>
              {/* 始め方はユーザー権限のランチャーと共通（playModes.ts） */}
              {PLAY_MODES.map((m) => (
                <button
                  key={m.id}
                  className={`btn ${m.id === 'normal' ? 'primary' : ''}`}
                  title={m.hint}
                  onClick={async () => {
                    update((d) => {
                      d.activeScenarioId = scenario.id;
                      return d;
                    });
                    await flush();
                    await api.player.open(scenario.id, m.opts);
                  }}
                >
                  {m.panelLabel}
                </button>
              ))}
              <button
                className="btn"
                onClick={() =>
                  update((d) => {
                    d.activeScenarioId = scenario.id;
                    return d;
                  })
                }
              >
                使用中にする
              </button>
              <div className="spacer" />
              <button
                className="btn danger sm"
                onClick={() => {
                  if (!confirm(`「${scenario.name}」を削除しますか？`)) return;
                  update((d) => {
                    d.scenarios = d.scenarios.filter((s) => s.id !== scenario.id);
                    if (d.activeScenarioId === scenario.id) d.activeScenarioId = d.scenarios[0]?.id ?? null;
                    setSelectedId(d.scenarios[0]?.id ?? null);
                    return d;
                  });
                }}
              >
                削除
              </button>
            </div>

            <div className="col" style={{ gap: 6 }}>
              {scenario.steps.length === 0 && (
                <div className="small muted">まだステップがありません。下のボタンから追加してください。</div>
              )}
              {scenario.steps.map((step, i) => {
                const content = config.contents.find((c) => c.id === step.contentId);
                return (
                  <div key={step.id} className={`step-row ${step.enabled ? '' : 'disabled'}`}>
                    <div className="step-idx">{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div>{content?.name ?? '（削除されたコンテンツ）'}</div>
                      <div className="small muted">{content ? CONTENT_LABELS[content.type] : step.contentId}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={step.enabled}
                      title="有効 / スキップ"
                      onChange={(e) =>
                        patchScenario((s) => void (s.steps[i].enabled = e.target.checked))
                      }
                    />
                    <button className="btn sm ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                      ↑
                    </button>
                    <button
                      className="btn sm ghost"
                      onClick={() => move(i, 1)}
                      disabled={i === scenario.steps.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      className="btn sm danger"
                      onClick={() => patchScenario((s) => void s.steps.splice(i, 1))}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => setAddPickerOpen((v) => !v)}>
                ＋ コンテンツを追加
              </button>
              {addPickerOpen && (
                <div className="card" style={{ marginTop: 10 }}>
                  {available.length === 0 && <div className="small muted">追加できるコンテンツがありません。</div>}
                  <div className="list">
                    {available.map((c) => (
                      <div
                        key={c.id}
                        className="list-item"
                        onClick={() => {
                          patchScenario((s) => {
                            s.steps.push({ id: uid('st'), contentId: c.id, enabled: true });
                          });
                          setAddPickerOpen(false);
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div>{c.name}</div>
                          <div className="type">{CONTENT_LABELS[c.type]}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="small muted" style={{ marginTop: 8 }}>
                    ※ 同じコンテンツを2回使いたい場合は「コンテンツ」タブで複製してください。
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card muted">シナリオを選択してください。</div>
        )}
      </div>
    </>
  );
}
