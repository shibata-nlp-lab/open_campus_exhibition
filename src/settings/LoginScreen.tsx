import { useEffect, useState } from 'react';
import { ROLE_LABELS, type UserInfo } from '../types';
import { api, errText } from '../lib/api';
import { isValidPin } from '../permissions';

/**
 * 展示員のログイン。
 * ユーザーが 1 人も居ない状態では出さない（初期状態は認証なし）。
 */
export default function LoginScreen({ onDone }: { onDone: () => void }) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [id, setId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.auth.list().then((list) => {
      setUsers(list);
      setId((prev) => prev || list[0]?.id || '');
    });
  }, []);

  const submit = async () => {
    if (!id || !isValidPin(pin)) return;
    setBusy(true);
    setError(null);
    try {
      await api.auth.login(id, pin);
      onDone();
    } catch (e) {
      setError(errText(e));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <h1>🧠 LLM展示</h1>
        <p className="small muted">担当者を選んで PIN を入力してください。</p>

        <label className="small muted">担当者</label>
        <select className="select" value={id} onChange={(e) => setId(e.target.value)}>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}（{ROLE_LABELS[u.role]}）
            </option>
          ))}
        </select>

        <label className="small muted">PIN（4〜8桁）</label>
        <input
          className="input mono"
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          maxLength={8}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />

        {error && <div className="banner error">{error}</div>}

        <button className="btn lg primary" disabled={busy || !isValidPin(pin)} onClick={submit}>
          {busy ? '確認中…' : 'ログイン'}
        </button>

        <div className="small muted" style={{ marginTop: 4 }}>
          PIN が分からなくなった場合は、オーナーに再設定してもらってください。
        </div>
      </div>
    </div>
  );
}
