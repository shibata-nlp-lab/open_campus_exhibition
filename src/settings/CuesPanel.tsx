import type { CueSound } from '../types';
import { uid } from '../defaults';
import { api } from '../lib/api';
import { AssetPicker, Field, type PanelProps } from './common';

/**
 * ポン出しの設定。
 * コントローラのボタンを押した瞬間に、進行画面で鳴らす音を並べておく。
 * コンテンツの音声とは別枠で重ねて鳴るので、拍手・ジングル・効果音に使える。
 */
export default function CuesPanel({ config, update }: PanelProps) {
  const cues = config.settings.cues ?? [];

  const patch = (i: number, fn: (c: CueSound) => void) =>
    update((d) => {
      const list = (d.settings.cues ??= []);
      if (list[i]) fn(list[i]);
      return d;
    });

  const move = (i: number, delta: number) =>
    update((d) => {
      const list = (d.settings.cues ??= []);
      const j = i + delta;
      if (j < 0 || j >= list.length) return d;
      const [item] = list.splice(i, 1);
      list.splice(j, 0, item);
      return d;
    });

  return (
    <>
      <h2>ポン出し</h2>
      <p className="lead">
        コントローラのボタンで鳴らす音です。<strong>進行中の音声に重ねて</strong>鳴るので、
        拍手・ジングル・効果音のように「進行を止めずに足す」使い方ができます。
      </p>

      <div className="card" style={{ maxWidth: 720 }}>
        {cues.length === 0 && (
          <div className="small muted">
            まだありません。下のボタンで追加すると、コントローラ画面にボタンが並びます。
          </div>
        )}

        <div className="col" style={{ gap: 14 }}>
          {cues.map((cue, i) => (
            <div key={cue.id} className="card" style={{ margin: 0 }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <span className="chip">{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <Field label="ボタンの名前">
                    <input
                      className="input"
                      value={cue.label}
                      placeholder="拍手"
                      onChange={(e) => patch(i, (c) => void (c.label = e.target.value))}
                    />
                  </Field>
                </div>
                <button className="btn sm ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                  ↑
                </button>
                <button className="btn sm ghost" onClick={() => move(i, 1)} disabled={i === cues.length - 1}>
                  ↓
                </button>
                <button
                  className="btn sm danger"
                  onClick={() => {
                    if (!confirm(`「${cue.label || '名前なし'}」を削除しますか？`)) return;
                    update((d) => {
                      d.settings.cues = (d.settings.cues ?? []).filter((x) => x.id !== cue.id);
                      return d;
                    });
                  }}
                >
                  ✕
                </button>
              </div>

              <AssetPicker
                label="音声ファイル"
                value={cue.src}
                filters={[{ name: '音声', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg'] }]}
                onChange={(rel) => patch(i, (c) => void (c.src = rel))}
              />
              <div className="row">
                <div style={{ flex: 1 }}>
                  <Field label={`音量 ${(cue.volume * 100) | 0}%`}>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={cue.volume}
                      onChange={(e) => patch(i, (c) => void (c.volume = Number(e.target.value)))}
                    />
                  </Field>
                </div>
                <label className="row" style={{ gap: 6, whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={cue.loop}
                    onChange={(e) => patch(i, (c) => void (c.loop = e.target.checked))}
                  />
                  <span>ループ（もう一度押すと止まる）</span>
                </label>
                {cue.src && (
                  <button
                    className="btn sm"
                    title="この設定画面で鳴らして確かめます（進行画面には出ません）"
                    onClick={() => {
                      const el = new Audio(api.asset.url(cue.src!));
                      el.volume = cue.volume;
                      el.play().catch(() => {});
                    }}
                  >
                    ▶ 試聴
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn"
          style={{ marginTop: 14 }}
          onClick={() =>
            update((d) => {
              (d.settings.cues ??= []).push({
                id: uid('cue'),
                label: `ポン出し ${(d.settings.cues?.length ?? 0) + 1}`,
                src: null,
                volume: 0.8,
                loop: false,
              });
              return d;
            })
          }
        >
          ＋ ポン出しを追加
        </button>
      </div>

      <div className="banner warn" style={{ maxWidth: 720, marginTop: 16 }}>
        鳴らせるのは<strong>同時に1つ</strong>です。次を押すと前の音は止まります。
        進行画面の音声をまとめて止めているとき（M キー）は、ポン出しも鳴りません。
      </div>
    </>
  );
}
