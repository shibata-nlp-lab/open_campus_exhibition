import { useEffect, useState } from 'react';
import type { AuthState, Role } from '../types';
import { ROLE_LABELS } from '../types';
import { api } from '../lib/api';
import { canOpenSettings, canOpenTab, type SettingsTab } from '../permissions';
import { useConfig } from './useConfig';
import ScenarioPanel from './ScenarioPanel';
import ContentPanel from './ContentPanel';
import ApiPanel from './ApiPanel';
import ResultsPanel from './ResultsPanel';
import GeneralPanel from './GeneralPanel';
import UsersPanel from './UsersPanel';
import LoginScreen from './LoginScreen';

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'scenario', label: 'シナリオ' },
  { id: 'content', label: 'コンテンツ' },
  { id: 'general', label: '全般' },
  { id: 'api', label: 'API' },
  { id: 'results', label: '集計結果' },
  { id: 'users', label: 'ユーザー' },
];

export default function SettingsApp() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [tab, setTab] = useState<SettingsTab>('scenario');
  const { config, update, savedAt, flush } = useConfig();

  const refreshAuth = () => api.auth.state().then(setAuth);
  useEffect(() => {
    refreshAuth();
  }, []);

  if (!config || !auth) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <div className="spin" />
      </div>
    );
  }

  // ユーザーを登録していれば、ログインするまで何も出さない
  if (auth.enabled && !auth.current) return <LoginScreen onDone={refreshAuth} />;

  // 認証を使っていない初期状態は owner 扱い（何も触れないと詰むため）
  const role: Role = auth.current?.role ?? 'owner';
  const visible = TABS.filter((t) => canOpenTab(role, t.id));

  // 「ユーザー」権限は管理画面を開けない。シナリオの実行だけできる画面を出す
  if (!canOpenSettings(role)) {
    const scenarios = config.scenarios;
    return (
      <div className="launcher">
        <h1>🧠 {config.settings.exhibitTitle}</h1>
        <p className="small muted">
          {auth.current?.name}さん（{ROLE_LABELS[role]}）— シナリオを選んで開始してください。
        </p>
        <div className="col" style={{ gap: 8, width: 'min(560px, 90%)' }}>
          {scenarios.map((s) => (
            <button key={s.id} className="btn lg primary" onClick={() => api.player.open(s.id)}>
              ▶ {s.name}
            </button>
          ))}
          {scenarios.length === 0 && <div className="banner warn">シナリオがまだありません。</div>}
        </div>
        <button
          className="btn ghost"
          onClick={async () => {
            await api.auth.logout();
            refreshAuth();
          }}
        >
          ログアウト
        </button>
      </div>
    );
  }

  const active = visible.some((t) => t.id === tab) ? tab : visible[0].id;

  return (
    <div className="settings">
      <nav className="sidebar">
        <h1>🧠 LLM展示 設定</h1>
        {visible.map((t) => (
          <button key={t.id} className={`navbtn ${active === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        <div className="spacer" />
        {auth.current && (
          <div className="small muted" style={{ padding: '0 12px 6px' }}>
            {auth.current.name}（{ROLE_LABELS[role]}）
            <br />
            <button
              className="btn sm ghost"
              style={{ marginTop: 4 }}
              onClick={async () => {
                await api.auth.logout();
                refreshAuth();
              }}
            >
              ログアウト
            </button>
          </div>
        )}
        <div className="small muted" style={{ padding: '0 12px 8px' }}>
          {savedAt ? `保存済み ${new Date(savedAt).toLocaleTimeString()}` : '自動保存されます'}
        </div>
      </nav>
      <main className="main">
        {active === 'scenario' && <ScenarioPanel config={config} update={update} flush={flush} />}
        {active === 'content' && <ContentPanel config={config} update={update} />}
        {active === 'general' && <GeneralPanel config={config} update={update} />}
        {active === 'api' && <ApiPanel config={config} update={update} />}
        {active === 'results' && <ResultsPanel />}
        {active === 'users' && <UsersPanel me={auth.current} onChanged={refreshAuth} />}
      </main>
    </div>
  );
}
