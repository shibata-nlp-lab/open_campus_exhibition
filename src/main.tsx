import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import SettingsApp from './settings/SettingsApp';
import PlayerApp from './player/PlayerApp';
import ControllerApp from './controller/ControllerApp';

function Root() {
  const hash = window.location.hash.replace(/^#/, '');
  const [route] = hash.split('?');
  if (route.startsWith('/player')) {
    const params = new URLSearchParams(hash.split('?')[1] ?? '');
    return (
      <PlayerApp
        scenarioId={params.get('scenario')}
        startStandby={params.get('standby') === '1'}
        startMuted={params.get('mute') === '1'}
        startAuto={params.get('auto') === '1'}
      />
    );
  }
  if (route.startsWith('/controller')) return <ControllerApp />;
  return <SettingsApp />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
