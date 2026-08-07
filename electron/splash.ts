import { BrowserWindow } from 'electron';

/**
 * 起動スプラッシュ。
 *
 * BrowserWindow は生成した瞬間に空の白（または背景色）で表示されてしまい、
 * レンダラのバンドルを読み終えるまで何も映らない時間ができる。
 * そこで本体ウィンドウは show:false で作って ready-to-show まで隠し、
 * 代わりに data URL だけで完結するこの小窓を先に出す（読み込み待ちが無い）。
 */
const HTML = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;overflow:hidden}
  body{
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
    background:#0f1522;color:#e8edf7;
    font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic UI",sans-serif;
    -webkit-user-select:none;
  }
  .mark{width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#4c8dff,#6ee7c8)}
  h1{margin:0;font-size:17px;font-weight:600;letter-spacing:.04em}
  p{margin:0;font-size:12px;color:#93a2bd}
  .bar{width:180px;height:3px;border-radius:2px;background:#2a3550;overflow:hidden}
  .bar i{display:block;width:40%;height:100%;border-radius:2px;background:#4c8dff;animation:slide 1.1s ease-in-out infinite}
  @keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
</style>
<div class="mark"></div>
<h1>LLM展示</h1>
<p>起動しています…</p>
<div class="bar"><i></i></div>`;

let splash: BrowserWindow | null = null;

export function showSplash() {
  if (splash && !splash.isDestroyed()) return;
  splash = new BrowserWindow({
    width: 320,
    height: 240,
    frame: false,
    resizable: false,
    movable: false,
    show: false,
    center: true,
    backgroundColor: '#0f1522',
    // 外部を読まないので何も許可しない
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(HTML));
  splash.once('ready-to-show', () => splash?.show());
  splash.on('closed', () => (splash = null));
}

export function closeSplash() {
  if (splash && !splash.isDestroyed()) splash.close();
  splash = null;
}
