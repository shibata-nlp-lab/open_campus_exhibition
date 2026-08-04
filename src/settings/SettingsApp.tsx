import { useState } from 'react';
import { useConfig } from './useConfig';
import ScenarioPanel from './ScenarioPanel';
import ContentPanel from './ContentPanel';
import ApiPanel from './ApiPanel';
import ResultsPanel from './ResultsPanel';
import GeneralPanel from './GeneralPanel';

type Tab = 'scenario' | 'content' | 'general' | 'api' | 'results';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'scenario', label: 'シナリオ' },
  { id: 'content', label: 'コンテンツ' },
  { id: 'general', label: '全般' },
  { id: 'api', label: 'API' },
  { id: 'results', label: '集計結果' },
];

export default function SettingsApp() {
  const [tab, setTab] = useState<Tab>('scenario');
  const { config, update, savedAt, flush } = useConfig();

  if (!config) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <div className="spin" />
      </div>
    );
  }

  return (
    <div className="settings">
      <nav className="sidebar">
        <h1>🧠 LLM展示 設定</h1>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`navbtn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className="spacer" />
        <div className="small muted" style={{ padding: '0 12px 8px' }}>
          {savedAt ? `保存済み ${new Date(savedAt).toLocaleTimeString()}` : '自動保存されます'}
        </div>
      </nav>
      <main className="main">
        {tab === 'scenario' && <ScenarioPanel config={config} update={update} flush={flush} />}
        {tab === 'content' && <ContentPanel config={config} update={update} />}
        {tab === 'general' && <GeneralPanel config={config} update={update} />}
        {tab === 'api' && <ApiPanel config={config} update={update} />}
        {tab === 'results' && <ResultsPanel />}
      </main>
    </div>
  );
}
