import { useEffect, useState } from 'react';
import type { DisplayInfo } from '../types';
import { api } from '../lib/api';
import { DEFAULT_ATTRIBUTE_OPTIONS, mergeSamples } from '../defaults';
import { Field, Toggle, type PanelProps } from './common';

export default function GeneralPanel({ config, update }: PanelProps) {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [attrText, setAttrText] = useState(
    (config.settings.attributeOptions ?? DEFAULT_ATTRIBUTE_OPTIONS).join('\n')
  );
  useEffect(() => {
    api.display.list().then(setDisplays);
    return api.display.onChanged(setDisplays);
  }, []);

  const s = config.settings;
  const patch = (fn: (x: typeof s) => void) =>
    update((d) => {
      fn(d.settings);
      return d;
    });

  return (
    <>
      <h2>全般</h2>
      <p className="lead">進行画面の見た目と挙動の設定です。</p>

      <div className="card" style={{ maxWidth: 620 }}>
        <Field label="展示タイトル（進行画面の下部に表示）">
          <input className="input" value={s.exhibitTitle} onChange={(e) => patch((x) => void (x.exhibitTitle = e.target.value))} />
        </Field>
        <Toggle label="進行画面を全画面で開く" checked={s.fullscreen} onChange={(v) => patch((x) => void (x.fullscreen = v))} />
        <Toggle
          label="キーボード操作の一覧をコントローラ画面に表示する"
          checked={s.showHints}
          onChange={(v) => patch((x) => void (x.showHints = v))}
        />
      </div>

      <div className="card" style={{ maxWidth: 620, marginTop: 16 }}>
        <div className="small muted" style={{ marginBottom: 10 }}>モニター構成</div>
        <Toggle
          label="外部モニターがあれば、そちらに進行画面を全画面表示する"
          checked={s.preferExternalDisplay}
          onChange={(v) => patch((x) => void (x.preferExternalDisplay = v))}
        />
        <Toggle
          label="そのとき本体画面にコントローラを表示する"
          checked={s.showController}
          onChange={(v) => patch((x) => void (x.showController = v))}
        />
        <div className="small muted" style={{ marginTop: 10, marginBottom: 6 }}>検出中のモニター</div>
        <table className="data">
          <tbody>
            {displays.map((d) => (
              <tr key={d.id}>
                <td>{d.label}</td>
                <td className="mono small">{d.width}×{d.height}</td>
                <td className="small muted">
                  {d.isPrimary ? '本体画面' : '外部モニター'}
                  {d.isPlayer ? ' / 進行画面を表示中' : ''}
                </td>
              </tr>
            ))}
            {displays.length === 0 && (
              <tr><td className="small muted">取得中…</td></tr>
            )}
          </tbody>
        </table>
        {displays.length < 2 && (
          <div className="small muted" style={{ marginTop: 8 }}>
            モニターが1台のみのため、進行画面は本体画面に全画面表示され、コントローラは開きません。
          </div>
        )}
      </div>

      <div className="card" style={{ maxWidth: 620, marginTop: 16 }}>
        <div className="small muted" style={{ marginBottom: 10 }}>来場者の属性（コントローラで記録する区分）</div>
        <p className="small muted" style={{ marginTop: 0 }}>
          進行中にコントローラ画面から、来場グループの内訳を人数つきで記録できます。ここでその区分を決めます（1行に1つ）。
        </p>
        {/* 入力中は改行をそのまま保つため、確定（フォーカスが外れたとき）に配列へ直す */}
        <textarea
          className="input"
          rows={7}
          value={attrText}
          onChange={(e) => setAttrText(e.target.value)}
          onBlur={() => {
            const list = attrText.split('\n').map((v) => v.trim()).filter(Boolean);
            const next = list.length > 0 ? list : DEFAULT_ATTRIBUTE_OPTIONS.slice();
            setAttrText(next.join('\n'));
            patch((x) => void (x.attributeOptions = next));
          }}
        />
      </div>

      <div className="card" style={{ maxWidth: 620, marginTop: 16 }}>
        <div className="small muted" style={{ marginBottom: 10 }}>
          進行画面のキーボード操作（この一覧はコントローラ画面にも表示されます）
        </div>
        <table className="data">
          <tbody>
            <tr><td className="mono">→ / Space / PageDown</td><td>次へ</td></tr>
            <tr><td className="mono">← / PageUp</td><td>戻る</td></tr>
            <tr><td className="mono">N</td><td>次のコンテンツへスキップ</td></tr>
            <tr><td className="mono">P</td><td>前のコンテンツへ</td></tr>
            <tr><td className="mono">S</td><td>待機画面（お待ちください）の表示 / 解除</td></tr>
            <tr><td className="mono">R</td><td>最初からやり直す</td></tr>
            <tr><td className="mono">F</td><td>全画面の切り替え</td></tr>
            <tr><td className="mono">Esc</td><td>進行画面を閉じる</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card" style={{ maxWidth: 620, marginTop: 16 }}>
        <div className="small muted" style={{ marginBottom: 10 }}>サンプル教材</div>
        <p className="small muted" style={{ marginTop: 0 }}>
          同梱の教材（スライド7本・クイズ2本・ゲーム問題・待機画面と、それらを並べた「フル版」「ショート版」シナリオ）のうち、
          まだ入っていないものだけを<strong>追加</strong>します。今あるコンテンツやシナリオは消えず、
          編集したものが上書きされることもありません。通常は起動時に自動で取り込まれるため、押す必要はありません。
        </p>
        <button
          className="btn"
          onClick={() => {
            update((d) => {
              const added = mergeSamples(d);
              window.setTimeout(
                () =>
                  alert(
                    added.addedContents || added.addedScenarios
                      ? `コンテンツ ${added.addedContents} 件、シナリオ ${added.addedScenarios} 件を追加しました。`
                      : 'すでに最新のサンプル教材が入っています。'
                  ),
                0
              );
              return d;
            });
          }}
        >
          サンプル教材を追加読み込み
        </button>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn sm" onClick={() => api.config.reveal()}>
          設定ファイルの場所を開く
        </button>
      </div>
    </>
  );
}
