import { useState } from 'react';
import type { Content, ContentType } from '../types';
import { CONTENT_LABELS, createContent, DEFAULT_AUTO_SEC, uid } from '../defaults';
import { ContentEditor } from './editors';
import { Field, NumberField, type PanelProps } from './common';

const TYPES = Object.keys(CONTENT_LABELS) as ContentType[];
/** 1つだけあれば足りる種別（重複作成は可能だが新規追加メニューでは注意書きを出す） */
const SINGLETON: ContentType[] = ['interactive1', 'interactive2', 'game'];

export default function ContentPanel({ config, update }: PanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(config.contents[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const content = config.contents.find((c) => c.id === selectedId) ?? null;

  const patch = (fn: (c: Content) => void) =>
    update((d) => {
      const c = d.contents.find((x) => x.id === selectedId);
      if (c) fn(c);
      return d;
    });

  const usedIn = (id: string) =>
    config.scenarios.filter((s) => s.steps.some((st) => st.contentId === id)).map((s) => s.name);

  return (
    <>
      <h2>コンテンツ</h2>
      <p className="lead">展示の部品を作成・編集します。ここで作ったものをシナリオに並べます。</p>

      <div className="split">
        <div className="col">
          <div className="list">
            {config.contents.map((c) => (
              <div
                key={c.id}
                className={`list-item ${c.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                <div style={{ flex: 1 }}>
                  <div>{c.name}</div>
                  <div className="type">{CONTENT_LABELS[c.type]}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="btn sm" onClick={() => setAdding((v) => !v)}>
            ＋ 新規コンテンツ
          </button>
          {adding && (
            <div className="card">
              <div className="list">
                {TYPES.map((t) => {
                  const exists = config.contents.some((c) => c.type === t);
                  return (
                    <div
                      key={t}
                      className="list-item"
                      onClick={() => {
                        const c = createContent(t);
                        update((d) => {
                          d.contents.push(c);
                          return d;
                        });
                        setSelectedId(c.id);
                        setAdding(false);
                      }}
                    >
                      <div style={{ flex: 1 }}>{CONTENT_LABELS[t]}</div>
                      {SINGLETON.includes(t) && exists && <span className="chip">作成済</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {content ? (
          <div className="card">
            <div className="row" style={{ marginBottom: 14 }}>
              <span className="chip">{CONTENT_LABELS[content.type]}</span>
              <div className="spacer" />
              <button
                className="btn sm"
                onClick={() => {
                  const copy = structuredClone(content);
                  copy.id = uid(content.type);
                  copy.name = content.name + ' のコピー';
                  update((d) => {
                    d.contents.push(copy);
                    return d;
                  });
                  setSelectedId(copy.id);
                }}
              >
                複製
              </button>
              <button
                className="btn sm danger"
                onClick={() => {
                  const used = usedIn(content.id);
                  const msg = used.length
                    ? `「${content.name}」は次のシナリオで使用中です:\n${used.join('\n')}\n削除するとシナリオからも外れます。よろしいですか？`
                    : `「${content.name}」を削除しますか？`;
                  if (!confirm(msg)) return;
                  update((d) => {
                    d.contents = d.contents.filter((c) => c.id !== content.id);
                    for (const s of d.scenarios) s.steps = s.steps.filter((st) => st.contentId !== content.id);
                    return d;
                  });
                  setSelectedId(null);
                }}
              >
                削除
              </button>
            </div>

            <Field label="表示名（設定画面用）">
              <input className="input" value={content.name} onChange={(e) => patch((c) => void (c.name = e.target.value))} />
            </Field>
            <Field label="進行メモ（任意・コントローラ画面にのみ表示）">
              <input className="input" value={content.note ?? ''} onChange={(e) => patch((c) => void (c.note = e.target.value))} />
            </Field>
            {/* 体験①②は画面ごとに待ち時間を持つので、こちらの共通欄は出さない */}
            {content.type !== 'interactive1' && content.type !== 'interactive2' && (
              <NumberField
                label="自動モードの待ち時間"
                value={content.autoSec ?? DEFAULT_AUTO_SEC}
                max={600}
                suffix="秒（音声が鳴り終わってから次へ。自動モードのときだけ使います）"
                onChange={(v) => patch((c) => void (c.autoSec = v))}
              />
            )}

            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '16px 0' }} />

            {/* 分岐（体験に戻る）は戻り先を他のコンテンツから選ぶので、一覧を渡す */}
            <ContentEditor content={content} patch={patch} contents={config.contents} />

            <div className="small muted" style={{ marginTop: 16 }}>
              使用中のシナリオ: {usedIn(content.id).join(' / ') || 'なし'}
            </div>
          </div>
        ) : (
          <div className="card muted">左のリストからコンテンツを選択してください。</div>
        )}
      </div>
    </>
  );
}
