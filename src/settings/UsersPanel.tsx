import { useEffect, useState } from 'react';
import { ROLE_LABELS, type Role, type UserInfo } from '../types';
import { api, errText } from '../lib/api';
import { assignableRoles, canManageUser, isValidPin } from '../permissions';
import { Field } from './common';

const ROLE_HELP: Record<Role, string> = {
  owner: 'すべての管理画面。他のユーザーの権限も変更できます。',
  admin: 'API 以外の管理画面。エディターとユーザーの権限を変更できます。',
  editor: 'シナリオとコンテンツのみ。展示の中身を作る担当者向け。',
  user: '既存シナリオの実行のみ（始め方は4つとも選べます）。管理画面は開けません。当日の展示員向け。',
};

export default function UsersPanel({ me, onChanged }: { me: UserInfo | null; onChanged: () => void }) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');

  const myRole = me?.role ?? 'owner';
  const roles = assignableRoles(myRole);
  const first = users.length === 0;

  const refresh = () => api.auth.list().then(setUsers);
  useEffect(() => {
    refresh();
  }, []);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    setError(null);
    try {
      await fn();
      await refresh();
      onChanged();
      setMsg(ok);
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <div className="panel">
      <h2>ユーザー</h2>

      {first ? (
        <div className="banner warn" style={{ marginBottom: 14 }}>
          いまはユーザーが登録されておらず、<strong>誰でもすべての設定を触れる状態</strong>です。
          最初に作るユーザーは自動的に<strong>オーナー</strong>になり、以降はログインが必要になります。
        </div>
      ) : (
        <div className="banner warn" style={{ marginBottom: 14 }}>
          これは<strong>うっかり操作を防ぐための仕切り</strong>で、セキュリティ機構ではありません。
          同じPCの中のファイルを直接編集すれば誰でも変えられます。
          PIN を全員分忘れたときは <span className="mono">users.json</span> を削除すると認証なしの状態に戻ります。
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm ghost" onClick={() => api.auth.reveal()}>
              users.json の場所を開く
            </button>
          </div>
        </div>
      )}

      {msg && <div className="banner ok" style={{ marginBottom: 14 }}>{msg}</div>}
      {error && <div className="banner error" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="small muted" style={{ marginBottom: 8 }}>
          {first ? 'オーナーを作成' : 'ユーザーを追加'}
        </div>
        <Field label="名前">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例）柴田" />
        </Field>
        <Field label="PIN（4〜8桁の数字）">
          <input
            className="input mono"
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        {!first && (
          <Field label="権限" hint={ROLE_HELP[role]}>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button
          className="btn primary"
          disabled={!name.trim() || !isValidPin(pin)}
          onClick={() =>
            run(async () => {
              await api.auth.add(name, pin, role);
              setName('');
              setPin('');
            }, first ? 'オーナーを作成しました。' : 'ユーザーを追加しました。')
          }
        >
          {first ? 'オーナーを作成する' : '追加する'}
        </button>
      </div>

      {users.length > 0 && (
        <div className="col" style={{ gap: 8 }}>
          {users.map((u) => {
            const isSelf = me?.id === u.id;
            const manageable = canManageUser(myRole, u.role, isSelf);
            return (
              <div className="card" key={u.id}>
                <div className="row">
                  <strong>{u.name}</strong>
                  {isSelf && <span className="chip">自分</span>}
                  <div className="spacer" />
                  <select
                    className="select"
                    style={{ maxWidth: 220 }}
                    value={u.role}
                    disabled={!manageable}
                    onChange={(e) => run(() => api.auth.setRole(u.id, e.target.value as Role), '権限を変更しました。')}
                  >
                    {(manageable ? roles : [u.role]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn sm"
                    onClick={() => {
                      setPinFor(pinFor === u.id ? null : u.id);
                      setNewPin('');
                    }}
                    disabled={!manageable && !isSelf}
                  >
                    PIN変更
                  </button>
                  <button
                    className="btn sm danger"
                    disabled={!manageable}
                    onClick={() => run(() => api.auth.remove(u.id), '削除しました。')}
                  >
                    削除
                  </button>
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>{ROLE_HELP[u.role]}</div>
                {pinFor === u.id && (
                  <div className="row" style={{ marginTop: 8 }}>
                    <input
                      className="input mono"
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="新しい PIN"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    />
                    <button
                      className="btn primary"
                      disabled={!isValidPin(newPin)}
                      onClick={() =>
                        run(async () => {
                          await api.auth.setPin(u.id, newPin);
                          setPinFor(null);
                        }, 'PIN を変更しました。')
                      }
                    >
                      保存
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
