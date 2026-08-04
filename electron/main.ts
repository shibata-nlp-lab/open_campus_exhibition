import { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, screen, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  appendResult,
  assetAbsolutePath,
  assetsDir,
  ensureDirs,
  importAsset,
  loadConfig,
  readCache,
  readResults,
  saveConfig,
  userDir,
  writeCache,
} from './config';
import { embed, nextTokenCandidates, verifyKey } from './openai';
import type { ApiResult, AppConfig, DisplayInfo, PlaybackCommand, PlaybackState } from '../src/types';

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

let settingsWindow: BrowserWindow | null = null;
let playerWindow: BrowserWindow | null = null;
let controllerWindow: BrowserWindow | null = null;
/** 進行画面を表示中のディスプレイ ID */
let playerDisplayId: number | null = null;
/** コントローラが後から開いても現在値を出せるように保持 */
let lastPlaybackState: PlaybackState | null = null;

/* ---------------- API キー（safeStorage で暗号化して別ファイル保存） ---------------- */

const keyPath = () => path.join(userDir(), 'openai.key');

function saveApiKey(key: string) {
  ensureDirs();
  if (!key) {
    fs.rmSync(keyPath(), { force: true });
    return;
  }
  const buf = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(key)
    : Buffer.from('plain:' + key, 'utf-8');
  fs.writeFileSync(keyPath(), buf);
}

function readApiKey(): string {
  try {
    const buf = fs.readFileSync(keyPath());
    const asText = buf.toString('utf-8');
    if (asText.startsWith('plain:')) return asText.slice(6);
    return safeStorage.decryptString(buf);
  } catch {
    return '';
  }
}

/**
 * 例外を投げずに ApiResult で返す。
 * ipcMain.handle が reject するとメインプロセスのログにスタックトレースが出るため、
 * 「キー未設定」のような想定内の失敗はここで握りつぶして静かに返す。
 */
async function asResult<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const NO_KEY = 'OpenAI API キーが設定されていません。設定画面 →「API」タブで登録してください。';

/* ---------------- ウィンドウ ---------------- */

function rendererUrl(hash: string) {
  if (DEV_URL) return `${DEV_URL}#${hash}`;
  return `${pathToFileURL(path.join(__dirname, '../renderer/index.html')).href}#${hash}`;
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 700,
    title: 'LLM展示 — 設定',
    backgroundColor: '#0f1522',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false },
  });
  settingsWindow.loadURL(rendererUrl('/settings'));
  settingsWindow.on('closed', () => (settingsWindow = null));
}

/** 進行画面を出すディスプレイを決める（外部モニター優先） */
function pickPlayerDisplay(preferExternal: boolean) {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  if (!preferExternal) return { target: primary, external: false };
  const external = displays.find((d) => d.id !== primary.id);
  return external ? { target: external, external: true } : { target: primary, external: false };
}

/** コントローラの操作を進行画面へ送る */
function sendToPlayer(cmd: PlaybackCommand) {
  if (playerWindow && !playerWindow.isDestroyed()) playerWindow.webContents.send('playback:command', cmd);
}

/**
 * コントローラのキー操作をメインプロセス側で拾う。
 * レンダラ内のどこにフォーカスがあっても、IME が有効でも確実に効かせるため
 * before-input-event（レンダラより先に発火）で処理する。
 * Space だけはボタンのクリックと二重に反応してしまうのでレンダラ側に任せる。
 */
function attachControllerKeys(win: BrowserWindow) {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.meta || input.control || input.alt) return;

    const handled = (fn: () => void) => {
      event.preventDefault();
      fn();
    };

    switch (input.key) {
      case 'ArrowRight':
      case 'PageDown':
        return handled(() => sendToPlayer({ type: 'advance' }));
      case 'ArrowLeft':
      case 'PageUp':
        return handled(() => sendToPlayer({ type: 'back' }));
      case 'Escape':
        return handled(() => playerWindow?.close());
    }

    // input.key は IME の状態によらず物理キーに対応した文字が入る
    switch (input.key.toLowerCase()) {
      case 'n':
        return handled(() => sendToPlayer({ type: 'next' }));
      case 'p':
        return handled(() => sendToPlayer({ type: 'prev' }));
      case 's':
        return handled(() => sendToPlayer({ type: 'standby' }));
      case 'r':
        return handled(() => sendToPlayer({ type: 'restart' }));
      case 'f':
        return handled(() => {
          if (playerWindow && !playerWindow.isDestroyed()) playerWindow.setFullScreen(!playerWindow.isFullScreen());
        });
    }
  });
}

function createControllerWindow(scenarioId: string) {
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.focus();
    return;
  }
  const primary = screen.getPrimaryDisplay();
  const w = Math.min(1000, primary.workArea.width - 80);
  const h = Math.min(760, primary.workArea.height - 80);
  controllerWindow = new BrowserWindow({
    x: primary.workArea.x + Math.floor((primary.workArea.width - w) / 2),
    y: primary.workArea.y + Math.floor((primary.workArea.height - h) / 2),
    width: w,
    height: h,
    title: 'コントローラ',
    backgroundColor: '#0f1522',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false },
  });
  controllerWindow.loadURL(rendererUrl(`/controller?scenario=${encodeURIComponent(scenarioId)}`));
  attachControllerKeys(controllerWindow);
  controllerWindow.on('closed', () => {
    controllerWindow = null;
    // コントローラを閉じたら進行画面も終了（対で使うもの）
    if (playerWindow && !playerWindow.isDestroyed()) playerWindow.close();
  });
}

function createPlayerWindow(scenarioId: string) {
  const cfg = loadConfig();
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.focus();
    return;
  }
  const { target, external } = pickPlayerDisplay(cfg.settings.preferExternalDisplay);
  playerDisplayId = target.id;

  playerWindow = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    title: '進行画面',
    backgroundColor: '#070b13',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false },
  });
  playerWindow.loadURL(rendererUrl(`/player?scenario=${encodeURIComponent(scenarioId)}`));

  if (cfg.settings.fullscreen) {
    // ウィンドウを対象ディスプレイへ移してから全画面化しないと主画面で全画面になる
    playerWindow.once('ready-to-show', () => {
      playerWindow?.setBounds(target.bounds);
      playerWindow?.setFullScreen(true);
    });
  }

  playerWindow.on('closed', () => {
    playerWindow = null;
    playerDisplayId = null;
    lastPlaybackState = null;
    if (controllerWindow && !controllerWindow.isDestroyed()) controllerWindow.close();
  });

  // 外部モニターに出した場合のみ、本体画面にコントローラを出す
  if (external && cfg.settings.showController) createControllerWindow(scenarioId);
}

function movePlayerToDisplay(displayId: number) {
  const display = screen.getAllDisplays().find((d) => d.id === displayId);
  if (!display || !playerWindow || playerWindow.isDestroyed()) return;
  const wasFullscreen = playerWindow.isFullScreen();
  if (wasFullscreen) playerWindow.setFullScreen(false);
  playerWindow.setBounds(display.bounds);
  playerDisplayId = display.id;
  if (wasFullscreen) setTimeout(() => playerWindow?.setFullScreen(true), 250);
}

function listDisplays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || (d.id === primary.id ? `本体画面 (${i + 1})` : `外部モニター (${i + 1})`),
    width: d.size.width,
    height: d.size.height,
    isPrimary: d.id === primary.id,
    isPlayer: d.id === playerDisplayId,
  }));
}

/* ---------------- カスタムプロトコル ---------------- */

protocol.registerSchemesAsPrivileged([
  { scheme: 'oc', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
  { scheme: 'ocfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
]);

function registerProtocols() {
  // oc://assets/<filename> … アプリが取り込んだアセット
  protocol.handle('oc', async (request) => {
    const url = new URL(request.url);
    const file = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const abs = path.join(assetsDir(), path.basename(file));
    if (!abs.startsWith(assetsDir())) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(abs).toString());
  });

  // ocfile://local/<絶対パスをURIエンコードしたもの> … 外部参照している Markdown とその画像
  protocol.handle('ocfile', async (request) => {
    const url = new URL(request.url);
    const abs = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!path.isAbsolute(abs) || !fs.existsSync(abs)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(abs).toString());
  });
}

/* ---------------- IPC ---------------- */

function registerIpc() {
  ipcMain.handle('config:load', () => loadConfig());
  ipcMain.handle('config:save', (_e, config: AppConfig) => {
    saveConfig(config);
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('config:changed', config);
    return true;
  });
  ipcMain.handle('config:reveal', () => shell.showItemInFolder(path.join(userDir(), 'config.json')));

  /* --- アセット --- */
  ipcMain.handle('asset:import', async (_e, filters: Electron.FileFilter[]) => {
    const res = await dialog.showOpenDialog({ properties: ['openFile'], filters });
    if (res.canceled || !res.filePaths[0]) return null;
    return importAsset(res.filePaths[0]);
  });
  ipcMain.handle('asset:importText', async (_e, args: { name: string; text: string; ext: string }) => {
    ensureDirs();
    const file = `${Date.now().toString(36)}_${args.name}${args.ext}`;
    fs.writeFileSync(path.join(assetsDir(), file), args.text, 'utf-8');
    return file;
  });
  ipcMain.handle('asset:readText', (_e, rel: string) => {
    try {
      return fs.readFileSync(assetAbsolutePath(rel), 'utf-8');
    } catch {
      return null;
    }
  });
  ipcMain.handle('asset:writeText', (_e, args: { rel: string; text: string }) => {
    fs.writeFileSync(assetAbsolutePath(args.rel), args.text, 'utf-8');
    return true;
  });

  /* --- 外部ファイル（Marp の .md を元の場所のまま参照する） --- */
  ipcMain.handle('file:pick', async (_e, filters: Electron.FileFilter[]) => {
    const res = await dialog.showOpenDialog({ properties: ['openFile'], filters });
    if (res.canceled || !res.filePaths[0]) return null;
    return res.filePaths[0];
  });
  ipcMain.handle('file:readText', (_e, abs: string): ApiResult<string> => {
    try {
      return { ok: true, data: fs.readFileSync(abs, 'utf-8') };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  ipcMain.handle('file:exists', (_e, abs: string) => {
    try {
      return fs.existsSync(abs);
    } catch {
      return false;
    }
  });
  ipcMain.handle('file:reveal', (_e, abs: string) => {
    if (fs.existsSync(abs)) shell.showItemInFolder(abs);
  });

  /* --- 汎用キャッシュ（埋め込みの再取得を避ける） --- */
  ipcMain.handle('cache:read', (_e, key: string) => readCache(key));
  ipcMain.handle('cache:write', (_e, args: { key: string; text: string }) => {
    writeCache(args.key, args.text);
    return true;
  });

  /* --- API キー --- */
  ipcMain.handle('key:status', () => ({
    saved: readApiKey().length > 0,
    encrypted: safeStorage.isEncryptionAvailable(),
  }));
  ipcMain.handle('key:set', (_e, key: string) =>
    asResult(async () => {
      if (key) {
        const ok = await verifyKey(key).catch(() => false);
        if (!ok) throw new Error('APIキーの検証に失敗しました（ネットワークまたはキーを確認してください）');
      }
      saveApiKey(key);
      return true;
    })
  );

  /* --- OpenAI（失敗しても例外を投げずログを汚さない） --- */
  ipcMain.handle('openai:nextTokens', (_e, args: { text: string; topK: number; model: string }) =>
    asResult(async () => {
      const key = readApiKey();
      if (!key) throw new Error(NO_KEY);
      return nextTokenCandidates(key, args.model, args.text, args.topK);
    })
  );
  ipcMain.handle('openai:embed', (_e, args: { inputs: string[]; model: string; dimensions?: number }) =>
    asResult(async () => {
      const key = readApiKey();
      if (!key) throw new Error(NO_KEY);
      return embed(key, args.model, args.inputs, args.dimensions);
    })
  );

  /* --- ウィンドウ / ディスプレイ --- */
  ipcMain.handle('player:open', (_e, scenarioId: string) => createPlayerWindow(scenarioId));
  ipcMain.handle('player:close', () => {
    playerWindow?.close();
    playerWindow = null;
  });
  // コントローラから進行画面の全画面を切り替える
  ipcMain.handle('player:toggleFullscreen', () => {
    if (playerWindow && !playerWindow.isDestroyed()) playerWindow.setFullScreen(!playerWindow.isFullScreen());
  });
  ipcMain.handle('window:toggleFullscreen', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    w?.setFullScreen(!w.isFullScreen());
  });
  ipcMain.handle('display:list', () => listDisplays());
  ipcMain.handle('display:movePlayer', (_e, displayId: number) => {
    movePlayerToDisplay(displayId);
    return listDisplays();
  });

  /* --- コントローラ ⇄ 進行画面 --- */
  ipcMain.on('playback:command', (_e, cmd: PlaybackCommand) => sendToPlayer(cmd));
  ipcMain.on('playback:state', (_e, state: PlaybackState) => {
    lastPlaybackState = state;
    if (controllerWindow && !controllerWindow.isDestroyed()) controllerWindow.webContents.send('playback:state', state);
  });
  ipcMain.handle('playback:current', () => lastPlaybackState);

  /* --- 集計 --- */
  ipcMain.handle('result:append', (_e, record) => {
    appendResult(record);
    return true;
  });
  ipcMain.handle('result:list', () => readResults());
  ipcMain.handle('result:exportCsv', async () => {
    const rows = readResults();
    const res = await dialog.showSaveDialog({ defaultPath: 'results.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (res.canceled || !res.filePath) return null;
    const header = 'ts,kind,scenarioId,contentId,payload\n';
    const body = rows
      .map((r) => [r.ts, r.kind, r.scenarioId ?? '', r.contentId, JSON.stringify(r.payload)]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','))
      .join('\n');
    fs.writeFileSync(res.filePath, '﻿' + header + body, 'utf-8');
    return res.filePath;
  });
}

/* ---------------- 起動 ---------------- */

app.whenReady().then(() => {
  ensureDirs();
  registerProtocols();
  registerIpc();
  createSettingsWindow();

  // モニターの抜き差しをコントローラに伝える
  const notifyDisplays = () => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('display:changed', listDisplays());
  };
  screen.on('display-added', notifyDisplays);
  screen.on('display-removed', notifyDisplays);
  screen.on('display-metrics-changed', notifyDisplays);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createSettingsWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
