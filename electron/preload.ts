import { contextBridge, ipcRenderer } from 'electron';
import type {
  ApiResult,
  AppConfig,
  AuthState,
  ClearResult,
  DisplayInfo,
  PlaybackCommand,
  PlaybackState,
  ResultRecord,
  Role,
  TokenCandidate,
  UserInfo,
} from '../src/types';

/** main は ApiResult で返す（メインプロセスのログを汚さないため）。ここで例外に戻す */
async function unwrap<T>(p: Promise<ApiResult<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

const api = {
  config: {
    load: (): Promise<AppConfig> => ipcRenderer.invoke('config:load'),
    save: (config: AppConfig): Promise<boolean> => ipcRenderer.invoke('config:save', config),
    reveal: () => ipcRenderer.invoke('config:reveal'),
    onChanged: (cb: (config: AppConfig) => void) => {
      const handler = (_e: unknown, config: AppConfig) => cb(config);
      ipcRenderer.on('config:changed', handler);
      return () => {
        ipcRenderer.off('config:changed', handler);
      };
    },
  },
  asset: {
    import: (filters: Electron.FileFilter[]): Promise<string | null> => ipcRenderer.invoke('asset:import', filters),
    importText: (name: string, text: string, ext: string): Promise<string> =>
      ipcRenderer.invoke('asset:importText', { name, text, ext }),
    readText: (rel: string): Promise<string | null> => ipcRenderer.invoke('asset:readText', rel),
    /**
     * 中身をそのまま読む。PDF のように oc:// では取り込めないものに使う
     * （pdf.js は http/https 以外を XHR で取りに行き、ステータス 0 で失敗する）。
     */
    read: (rel: string): Promise<Uint8Array> => unwrap(ipcRenderer.invoke('asset:read', rel)),
    writeText: (rel: string, text: string): Promise<boolean> => ipcRenderer.invoke('asset:writeText', { rel, text }),
    url: (rel: string) => `oc://assets/${encodeURIComponent(rel)}`,
  },
  file: {
    pick: (filters: Electron.FileFilter[]): Promise<string | null> => ipcRenderer.invoke('file:pick', filters),
    readText: (abs: string): Promise<string> => unwrap(ipcRenderer.invoke('file:readText', abs)),
    exists: (abs: string): Promise<boolean> => ipcRenderer.invoke('file:exists', abs),
    reveal: (abs: string) => ipcRenderer.invoke('file:reveal', abs),
    /** 絶対パスをレンダラから参照できる URL に変換 */
    url: (abs: string) => `ocfile://local/${encodeURIComponent(abs)}`,
  },
  cache: {
    read: (key: string): Promise<string | null> => ipcRenderer.invoke('cache:read', key),
    write: (key: string, text: string): Promise<boolean> => ipcRenderer.invoke('cache:write', { key, text }),
  },
  key: {
    status: (): Promise<{ saved: boolean; encrypted: boolean }> => ipcRenderer.invoke('key:status'),
    set: (key: string): Promise<boolean> => unwrap(ipcRenderer.invoke('key:set', key)),
  },
  openai: {
    nextTokens: (text: string, topK: number, model: string): Promise<TokenCandidate[]> =>
      unwrap(ipcRenderer.invoke('openai:nextTokens', { text, topK, model })),
    embed: (inputs: string[], model: string, dimensions?: number): Promise<number[][]> =>
      unwrap(ipcRenderer.invoke('openai:embed', { inputs, model, dimensions })),
  },
  local: {
    models: (): Promise<Array<{ size: string; label: string; mb: number; ready: boolean }>> =>
      ipcRenderer.invoke('local:models'),
    prepare: (size: string): Promise<{ ready: boolean }> => unwrap(ipcRenderer.invoke('local:prepare', size)),
    embed: (inputs: string[], size: string): Promise<number[][]> =>
      unwrap(ipcRenderer.invoke('local:embed', { inputs, size })),
    /** Ruri v3（Sarashina2 由来）のトークナイザで分割する。モデル本体は不要 */
    tokenize: (text: string, size: string): Promise<Array<{ id: number; text: string }>> =>
      unwrap(ipcRenderer.invoke('local:tokenize', { text, size })),
  },
  /** llm-jp の埋め込み層。分割はレンダラ側で行い、ここには トークンID だけを渡す */
  llmjp: {
    models: (): Promise<Array<{ size: string; label: string; mb: number; dim: number; ready: boolean }>> =>
      ipcRenderer.invoke('llmjp:models'),
    prepare: (size: string): Promise<{ ready: boolean }> => unwrap(ipcRenderer.invoke('llmjp:prepare', size)),
    embed: (groups: number[][], size: string): Promise<number[][]> =>
      unwrap(ipcRenderer.invoke('llmjp:embed', { groups, size })),
    /** 体験②用。こちらはモデル本体を動かして「次の1語」の確率を出す */
    nextStatus: (): Promise<{ repo: string; label: string; mb: number; ready: boolean }> =>
      ipcRenderer.invoke('llmjp:nextStatus'),
    prepareNext: (): Promise<{ ready: boolean }> => unwrap(ipcRenderer.invoke('llmjp:prepareNext')),
    nextTokens: (text: string, topK: number): Promise<TokenCandidate[]> =>
      unwrap(ipcRenderer.invoke('llmjp:nextTokens', { text, topK })),
  },
  player: {
    /** standby: true で待機画面を出した状態から始める（本編はコントローラから選ぶ） */
    open: (scenarioId: string, opts?: { standby?: boolean }) =>
      ipcRenderer.invoke('player:open', { scenarioId, standby: Boolean(opts?.standby) }),
    close: () => ipcRenderer.invoke('player:close'),
    /** 自分のウィンドウの全画面切替（進行画面から使う） */
    toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
    /** 進行画面の全画面切替（コントローラから使う） */
    togglePlayerFullscreen: () => ipcRenderer.invoke('player:toggleFullscreen'),
  },
  display: {
    list: (): Promise<DisplayInfo[]> => ipcRenderer.invoke('display:list'),
    movePlayer: (displayId: number): Promise<DisplayInfo[]> => ipcRenderer.invoke('display:movePlayer', displayId),
    onChanged: (cb: (displays: DisplayInfo[]) => void) => {
      const handler = (_e: unknown, displays: DisplayInfo[]) => cb(displays);
      ipcRenderer.on('display:changed', handler);
      return () => {
        ipcRenderer.off('display:changed', handler);
      };
    },
  },
  playback: {
    /** コントローラ → 進行画面 */
    send: (cmd: PlaybackCommand) => ipcRenderer.send('playback:command', cmd),
    onCommand: (cb: (cmd: PlaybackCommand) => void) => {
      const handler = (_e: unknown, cmd: PlaybackCommand) => cb(cmd);
      ipcRenderer.on('playback:command', handler);
      return () => {
        ipcRenderer.off('playback:command', handler);
      };
    },
    /** 進行画面 → コントローラ */
    publish: (state: PlaybackState) => ipcRenderer.send('playback:state', state),
    onState: (cb: (state: PlaybackState) => void) => {
      const handler = (_e: unknown, state: PlaybackState) => cb(state);
      ipcRenderer.on('playback:state', handler);
      return () => {
        ipcRenderer.off('playback:state', handler);
      };
    },
    current: (): Promise<PlaybackState | null> => ipcRenderer.invoke('playback:current'),
  },
  controller: {
    /** 入力欄にフォーカスがある間は main 側のショートカット横取りを止める */
    setTyping: (on: boolean) => ipcRenderer.send('controller:typing', on),
    /** コントローラ画面が開いているか（進行画面が操作ボタンを出すかの判断に使う） */
    exists: (): Promise<boolean> => ipcRenderer.invoke('controller:exists'),
    onPresence: (cb: (has: boolean) => void) => {
      const handler = (_e: unknown, has: boolean) => cb(has);
      ipcRenderer.on('controller:presence', handler);
      return () => {
        ipcRenderer.off('controller:presence', handler);
      };
    },
  },
  /** 展示員ユーザーと権限。PIN のハッシュはここには来ない */
  auth: {
    state: (): Promise<AuthState> => ipcRenderer.invoke('auth:state'),
    role: (): Promise<Role> => ipcRenderer.invoke('auth:role'),
    login: (id: string, pin: string): Promise<UserInfo> => unwrap(ipcRenderer.invoke('auth:login', { id, pin })),
    logout: (): Promise<boolean> => ipcRenderer.invoke('auth:logout'),
    list: (): Promise<UserInfo[]> => ipcRenderer.invoke('auth:list'),
    add: (name: string, pin: string, role: Role): Promise<UserInfo> =>
      unwrap(ipcRenderer.invoke('auth:add', { name, pin, role })),
    setRole: (id: string, role: Role): Promise<UserInfo> => unwrap(ipcRenderer.invoke('auth:setRole', { id, role })),
    setPin: (id: string, pin: string): Promise<boolean> => unwrap(ipcRenderer.invoke('auth:setPin', { id, pin })),
    remove: (id: string): Promise<boolean> => unwrap(ipcRenderer.invoke('auth:remove', id)),
    reveal: () => ipcRenderer.invoke('auth:reveal'),
  },
  results: {
    append: (record: ResultRecord) => ipcRenderer.invoke('result:append', record),
    list: (): Promise<ResultRecord[]> => ipcRenderer.invoke('result:list'),
    exportCsv: (): Promise<string | null> => ipcRenderer.invoke('result:exportCsv'),
    /** 確認ダイアログ＋バックアップ付きで全消去 */
    clear: (): Promise<ClearResult> => ipcRenderer.invoke('result:clear'),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type OcApi = typeof api;
