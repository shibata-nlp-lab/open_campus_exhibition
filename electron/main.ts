import { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, screen, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  appendResult,
  assetAbsolutePath,
  assetsDir,
  clearResults,
  ensureDirs,
  importAsset,
  loadConfig,
  readCache,
  readResults,
  saveConfig,
  userDir,
  writeCache,
} from './config';
import { resultsToCsv } from './csv';
import { closeSplash, showSplash } from './splash';
import {
  addUser,
  authState,
  effectiveRole,
  listUsers,
  login,
  logout,
  removeUser,
  setPin,
  setRole,
  usersPath,
} from './users';
import { canOpenTab } from '../src/permissions';
import { embed, nextTokenCandidates, verifyKey } from './openai';
import { embedLocal, isModelReady, prepareModel, RURI_MODELS, tokenizeRuri, type RuriSize } from './localEmbed';
import { embedLlmJpIds, isLlmJpReady, LLMJP_MODELS, prepareLlmJpEmbed, type LlmJpSize } from './llmjpEmbed';
import {
  isPredictModelReady,
  nextTokensLocal,
  PREDICT_MODELS,
  preparePredictModel,
  type PredictModelId,
} from './predictNext';
import type { ApiResult, AppConfig, ClearResult, DisplayInfo, PlaybackCommand, PlaybackState, Role } from '../src/types';

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

let settingsWindow: BrowserWindow | null = null;
let playerWindow: BrowserWindow | null = null;
let controllerWindow: BrowserWindow | null = null;
/** 進行画面を表示中のディスプレイ ID */
let playerDisplayId: number | null = null;
/** コントローラが後から開いても現在値を出せるように保持 */
let lastPlaybackState: PlaybackState | null = null;
/** コントローラで入力欄にフォーカスがある間はショートカットを止める（時刻や属性の打ち込み用） */
let controllerTyping = false;

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
    // 中身が描けるまで出さない。空白が一瞬見えるのを避ける（代わりにスプラッシュを出す）
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false },
  });
  settingsWindow.loadURL(rendererUrl('/settings'));
  settingsWindow.once('ready-to-show', () => {
    closeSplash();
    settingsWindow?.show();
  });
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

/** コントローラの有無を進行画面に伝える（手元で操作できるなら画面上のボタンは出さない） */
function notifyControllerPresence() {
  const has = Boolean(controllerWindow && !controllerWindow.isDestroyed());
  if (playerWindow && !playerWindow.isDestroyed()) playerWindow.webContents.send('controller:presence', has);
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
    // 入力欄に打ち込んでいる間は Esc も含めて一切横取りしない（誤終了を防ぐ）
    if (controllerTyping) return;

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
  notifyControllerPresence();
  controllerWindow.on('closed', () => {
    controllerWindow = null;
    controllerTyping = false;
    notifyControllerPresence();
    // コントローラを閉じたら進行画面も終了（対で使うもの）
    if (playerWindow && !playerWindow.isDestroyed()) playerWindow.close();
  });
}

function createPlayerWindow(scenarioId: string, standby = false) {
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
    // 来場者に白い画面を見せないよう、描けるまで隠しておく
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false },
  });
  playerWindow.loadURL(
    rendererUrl(`/player?scenario=${encodeURIComponent(scenarioId)}${standby ? '&standby=1' : ''}`)
  );

  playerWindow.once('ready-to-show', () => {
    if (cfg.settings.fullscreen) {
      // ウィンドウを対象ディスプレイへ移してから全画面化しないと主画面で全画面になる
      playerWindow?.setBounds(target.bounds);
      playerWindow?.setFullScreen(true);
    }
    playerWindow?.show();
  });

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
  // PDF など、レンダラ側で中身のバイト列が必要なもの
  ipcMain.handle('asset:read', (_e, rel: string) =>
    asResult(async () => {
      const abs = assetAbsolutePath(rel);
      if (!fs.existsSync(abs)) throw new Error(`ファイルが見つかりません：${path.basename(rel)}`);
      return fs.readFileSync(abs);
    })
  );
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
      // タブを隠すだけでは足りないので、ここでも権限を見る
      if (!canOpenTab(effectiveRole(), 'api')) throw new Error('APIキーを変更する権限がありません。');
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

  /* --- ローカル埋め込み（Ruri v3） --- */
  ipcMain.handle('local:models', () =>
    Object.entries(RURI_MODELS).map(([size, m]) => ({
      size,
      label: m.label,
      mb: m.mb,
      ready: isModelReady(size as RuriSize),
    }))
  );
  ipcMain.handle('local:prepare', (_e, size: RuriSize) => asResult(() => prepareModel(size)));
  ipcMain.handle('local:embed', (_e, args: { inputs: string[]; size: RuriSize }) =>
    asResult(() => embedLocal(args.inputs, args.size))
  );
  ipcMain.handle('local:tokenize', (_e, args: { text: string; size: RuriSize }) =>
    asResult(() => tokenizeRuri(args.text, args.size))
  );

  /* --- llm-jp の埋め込み層（トークンIDで表を引くだけ） --- */
  ipcMain.handle('llmjp:models', () =>
    Object.entries(LLMJP_MODELS).map(([size, m]) => ({
      size,
      label: m.label,
      mb: m.mb,
      dim: m.dim,
      ready: isLlmJpReady(size as LlmJpSize),
    }))
  );
  ipcMain.handle('llmjp:prepare', (_e, size: LlmJpSize) => asResult(() => prepareLlmJpEmbed(size)));
  ipcMain.handle('llmjp:embed', (_e, args: { groups: number[][]; size: LlmJpSize }) =>
    asResult(async () => embedLlmJpIds(args.groups, args.size))
  );

  /* --- ローカルのモデル本体で次トークンを予測（体験②の通信なし版） --- */
  ipcMain.handle('predict:models', () =>
    Object.entries(PREDICT_MODELS).map(([id, m]) => ({
      id,
      label: m.label,
      mb: m.mb,
      ready: isPredictModelReady(id as PredictModelId),
    }))
  );
  ipcMain.handle('predict:prepare', (_e, id: PredictModelId) => asResult(() => preparePredictModel(id)));
  ipcMain.handle('predict:nextTokens', (_e, args: { text: string; topK: number; id: PredictModelId }) =>
    asResult(() => nextTokensLocal(args.text, args.topK, args.id))
  );

  /* --- ウィンドウ / ディスプレイ --- */
  ipcMain.handle('player:open', (_e, args: { scenarioId: string; standby?: boolean }) =>
    createPlayerWindow(args.scenarioId, args.standby)
  );
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
  ipcMain.on('controller:typing', (_e, on: boolean) => (controllerTyping = Boolean(on)));
  ipcMain.handle('controller:exists', () => Boolean(controllerWindow && !controllerWindow.isDestroyed()));

  /* --- ユーザーと権限 --- */
  ipcMain.handle('auth:state', () => authState());
  ipcMain.handle('auth:role', () => effectiveRole());
  ipcMain.handle('auth:login', (_e, args: { id: string; pin: string }) =>
    asResult(async () => login(args.id, args.pin))
  );
  ipcMain.handle('auth:logout', () => {
    logout();
    return true;
  });
  ipcMain.handle('auth:list', () => listUsers());
  ipcMain.handle('auth:add', (_e, args: { name: string; pin: string; role: Role }) =>
    asResult(async () => addUser(args.name, args.pin, args.role))
  );
  ipcMain.handle('auth:setRole', (_e, args: { id: string; role: Role }) =>
    asResult(async () => setRole(args.id, args.role))
  );
  ipcMain.handle('auth:setPin', (_e, args: { id: string; pin: string }) =>
    asResult(async () => setPin(args.id, args.pin))
  );
  ipcMain.handle('auth:remove', (_e, id: string) => asResult(async () => removeUser(id)));
  ipcMain.handle('auth:reveal', () => shell.showItemInFolder(usersPath()));

  /* --- 集計 --- */
  ipcMain.handle('result:append', (_e, record) => {
    appendResult(record);
    return true;
  });
  ipcMain.handle('result:list', () => readResults());
  /**
   * 集計のリセット。
   * フェイルセーフとして (1) 件数を出した OS のモーダルで確認し、
   * (2) 既定ボタンを「キャンセル」にし、(3) 消す前に必ずバックアップを取る。
   */
  ipcMain.handle('result:clear', async (e): Promise<ClearResult> => {
    const rows = readResults();
    const owner = BrowserWindow.fromWebContents(e.sender);
    const opts: Electron.MessageBoxOptions = {
      type: 'warning',
      title: '集計結果のリセット',
      message: `記録されている ${rows.length} 件をすべて消去しますか？`,
      detail:
        '消す直前に results-日時.jsonl という名前でバックアップを保存するので、あとから戻すことはできます。\nCSV書き出しがまだなら、先に書き出しておくことをおすすめします。',
      buttons: ['キャンセル', 'リセットする'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };
    const res = owner ? await dialog.showMessageBox(owner, opts) : await dialog.showMessageBox(opts);
    if (res.response !== 1) return { canceled: true, cleared: 0, backup: null };
    const done = clearResults();
    return { canceled: false, ...done };
  });
  ipcMain.handle('result:exportCsv', async () => {
    const rows = readResults();
    const res = await dialog.showSaveDialog({ defaultPath: 'results.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, resultsToCsv(rows), 'utf-8');
    return res.filePath;
  });
}

/* ---------------- 起動 ---------------- */

app.whenReady().then(() => {
  showSplash();
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
