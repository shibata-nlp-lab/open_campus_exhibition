import { contextBridge, ipcRenderer } from 'electron';
import type {
  ApiResult,
  AppConfig,
  DisplayInfo,
  PlaybackCommand,
  PlaybackState,
  ResultRecord,
  TokenCandidate,
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
  player: {
    open: (scenarioId: string) => ipcRenderer.invoke('player:open', scenarioId),
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
  results: {
    append: (record: ResultRecord) => ipcRenderer.invoke('result:append', record),
    list: (): Promise<ResultRecord[]> => ipcRenderer.invoke('result:list'),
    exportCsv: (): Promise<string | null> => ipcRenderer.invoke('result:exportCsv'),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type OcApi = typeof api;
