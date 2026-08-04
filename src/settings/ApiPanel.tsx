import { useEffect, useState } from 'react';
import { api, errText } from '../lib/api';
import { Field, type PanelProps } from './common';

export default function ApiPanel({ config, update }: PanelProps) {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<{ saved: boolean; encrypted: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [testOut, setTestOut] = useState<string | null>(null);

  const refresh = () => api.key.status().then(setStatus);
  useEffect(() => {
    refresh();
  }, []);

  const patch = (fn: (x: typeof config.settings) => void) =>
    update((d) => {
      fn(d.settings);
      return d;
    });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.key.set(key.trim());
      setKey('');
      await refresh();
      setMsg({ kind: 'ok', text: 'APIキーを保存しました。' });
    } catch (e) {
      setMsg({ kind: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setTestOut(null);
    setMsg(null);
    try {
      const cands = await api.openai.nextTokens('日本の首都は', 5, config.settings.chatModel);
      setTestOut(cands.map((c) => `${JSON.stringify(c.token)}  ${(c.prob * 100).toFixed(1)}%`).join('\n'));
    } catch (e) {
      setMsg({ kind: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>API</h2>
      <p className="lead">
        インタラクティブ1（埋め込み）とインタラクティブ2（次単語予測）で OpenAI API を使用します。
        クイズ・ゲーム・スライド・動画・アンケート・証明書は API 不要です。
      </p>

      <div className="card" style={{ maxWidth: 680 }}>
        <Field
          label="OpenAI API キー"
          hint={
            status?.encrypted
              ? 'OS のキーチェーンで暗号化して保存されます（config.json には保存されません）。'
              : 'この環境では OS 暗号化が使えないため平文で保存されます。共有PCでは注意してください。'
          }
        >
          <div className="row">
            <input
              className="input mono"
              type="password"
              placeholder={status?.saved ? '登録済み（変更する場合のみ入力）' : 'sk-...'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button className="btn primary" onClick={save} disabled={busy || !key.trim()}>
              保存
            </button>
          </div>
        </Field>

        <div className="row" style={{ marginBottom: 14 }}>
          <span className={`chip`} style={{ background: status?.saved ? '#16321f' : '#3a1d22', color: status?.saved ? '#a7f3c4' : '#ffb4b4', borderColor: 'transparent' }}>
            {status?.saved ? 'キー登録済み' : 'キー未登録'}
          </span>
          {status?.saved && (
            <button
              className="btn sm danger"
              onClick={async () => {
                await api.key.set('');
                refresh();
              }}
            >
              キーを削除
            </button>
          )}
        </div>

        <Field label="チャットモデル（次単語予測に使用）" hint="logprobs に対応したモデルを指定してください。">
          <input
            className="input mono"
            value={config.settings.chatModel}
            onChange={(e) => patch((x) => void (x.chatModel = e.target.value))}
          />
        </Field>
        <Field label="埋め込みモデル（トークナイズ体験に使用）">
          <input
            className="input mono"
            value={config.settings.embeddingModel}
            onChange={(e) => patch((x) => void (x.embeddingModel = e.target.value))}
          />
        </Field>

        <button className="btn" onClick={test} disabled={busy || !status?.saved}>
          接続テスト（「日本の首都は」の次トークン）
        </button>
        {busy && <div className="spin" style={{ marginTop: 12 }} />}
        {testOut && (
          <pre className="mono small" style={{ background: '#0d1320', padding: 12, borderRadius: 8, marginTop: 12 }}>
            {testOut}
          </pre>
        )}
        {msg && (
          <div className={`banner ${msg.kind}`} style={{ marginTop: 12 }}>
            {msg.text}
          </div>
        )}
      </div>

      <div className="banner warn" style={{ maxWidth: 680, marginTop: 16 }}>
        当日ネットワークが不安定な場合に備え、インタラクティブ1/2 はエラー時に「オフライン用の疑似計算」に自動フォールバックします
        （画面上にその旨が表示されます）。
      </div>
    </>
  );
}
