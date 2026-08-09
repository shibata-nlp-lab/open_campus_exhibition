# IPC リファレンス

レンダラから外に出る手段は `window.api` だけです。実体は [electron/preload.ts](../electron/preload.ts)、
受け側は [electron/main.ts](../electron/main.ts) の `registerIpc()` にまとまっています。

型は [src/lib/api.ts](../src/lib/api.ts) が `OcApi` として `window.api` に結び付けているので、
レンダラ側は `import { api } from '../lib/api'` するだけで補完が効きます。

## 例外の扱い（ApiResult 規約）

`ipcMain.handle` が reject すると、**想定内の失敗でもメインプロセスのログにスタックトレースが出ます**。
「APIキー未設定」のような日常的な失敗でログが埋まるのを避けるため、失敗しうるハンドラは
例外を投げずに `ApiResult<T>` を返し、preload の `unwrap()` がレンダラ側で例外に戻します。

```ts
// main: 投げない
async function asResult<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try { return { ok: true, data: await fn() }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// preload: 呼び出し側から見れば普通の例外
async function unwrap<T>(p: Promise<ApiResult<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
```

レンダラで表示するときは [`errText()`](../src/lib/api.ts) を通してください。
`Error invoking remote method '...':` という IPC 由来の前置きを落とします。

**新しく失敗しうるハンドラを足すときは、`asResult` + `unwrap` に揃えてください。**
下の表の「包む」列が ✓ のものがこの規約に従っています。

## config

| API | チャネル | 包む | 説明 |
| --- | --- | --- | --- |
| `config.load()` | `config:load` | | 読み込み。壊れていれば既定値を作って保存し直す |
| `config.save(config)` | `config:save` | | 保存し、**全ウィンドウに `config:changed` を配信** |
| `config.reveal()` | `config:reveal` | | config.json を OS のファイラで表示 |
| `config.onChanged(cb)` | `config:changed` | | 購読。戻り値は解除関数 |

## asset / file

`asset.*` は `userData/assets` に取り込んだファイル、`file.*` はユーザーの元の場所にあるファイルです。

| API | チャネル | 包む | 説明 |
| --- | --- | --- | --- |
| `asset.import(filters)` | `asset:import` | | ダイアログで選ばせて assets にコピー。相対パスを返す |
| `asset.importText(name, text, ext)` | `asset:importText` | | 文字列をファイルとして assets に置く |
| `asset.readText(rel)` | `asset:readText` | | 失敗時は `null` |
| `asset.writeText(rel, text)` | `asset:writeText` | | |
| `asset.url(rel)` | — | | `oc://assets/...` を組み立てるだけ（IPC しない） |
| `file.pick(filters)` | `file:pick` | | 絶対パスを返す |
| `file.readText(abs)` | `file:readText` | ✓ | |
| `file.exists(abs)` | `file:exists` | | |
| `file.reveal(abs)` | `file:reveal` | | |
| `file.url(abs)` | — | | `ocfile://local/...` を組み立てるだけ |

## cache

埋め込みの再取得は高くつくので、`userData/cache` に置きます。キーは `[^\w.-]` を `_` に潰し 120 文字で切ります。

| API | チャネル | 説明 |
| --- | --- | --- |
| `cache.read(key)` | `cache:read` | 無ければ `null` |
| `cache.write(key, text)` | `cache:write` | |

## key（OpenAI APIキー）

| API | チャネル | 包む | 説明 |
| --- | --- | --- | --- |
| `key.status()` | `key:status` | | `{ saved, encrypted }`。**キー本体は決してレンダラに渡しません** |
| `key.set(key)` | `key:set` | ✓ | 保存前に `/v1/models` で検証。空文字で削除 |

キーは `config.json` ではなく `userData/openai.key` に `safeStorage` で暗号化して保存します。
OS が暗号化を提供しない環境では `plain:` プレフィックス付きの平文になります。

## openai

| API | チャネル | 包む | 説明 |
| --- | --- | --- | --- |
| `openai.nextTokens(text, topK, model)` | `openai:nextTokens` | ✓ | `top_logprobs` で次トークン候補。topK は 1..20 に丸め |
| `openai.embed(inputs, model, dimensions?)` | `openai:embed` | ✓ | 1000 件ずつ分割送信 |

タイムアウトは通常 15 秒、埋め込みは 60 秒です（[openai.ts](../electron/openai.ts)）。

## local（Ruri v3）

| API | チャネル | 包む | 説明 |
| --- | --- | --- | --- |
| `local.models()` | `local:models` | | サイズ一覧とダウンロード済みか |
| `local.prepare(size)` | `local:prepare` | ✓ | 事前ダウンロード |
| `local.embed(inputs, size)` | `local:embed` | ✓ | 平均プーリング＋L2正規化済みのベクトル |
| `local.tokenize(text, size)` | `local:tokenize` | ✓ | Ruri のトークナイザで分割。**モデル本体は不要** |

詳細は [nlp.md](nlp.md)。

## player / display

| API | チャネル | 説明 |
| --- | --- | --- |
| `player.open(scenarioId)` | `player:open` | 進行画面（＋条件を満たせばコントローラ）を開く |
| `player.close()` | `player:close` | |
| `player.toggleFullscreen()` | `window:toggleFullscreen` | **呼び出し元**のウィンドウを切り替え |
| `player.togglePlayerFullscreen()` | `player:toggleFullscreen` | **進行画面**を切り替え（コントローラから使う） |
| `display.list()` | `display:list` | |
| `display.movePlayer(id)` | `display:movePlayer` | 移動後の一覧を返す |
| `display.onChanged(cb)` | `display:changed` | モニターの抜き差しで自動配信 |

## playback（進行画面 ⇄ コントローラ）

ここだけ `invoke` ではなく `send`（一方向）を使います。往復の必要がなく、頻度が高いためです。

| API | チャネル | 向き | 説明 |
| --- | --- | --- | --- |
| `playback.send(cmd)` | `playback:command` | コントローラ → 進行画面 | `PlaybackCommand` |
| `playback.onCommand(cb)` | `playback:command` | 進行画面が購読 | |
| `playback.publish(state)` | `playback:state` | 進行画面 → コントローラ | 変化時のみ送る |
| `playback.onState(cb)` | `playback:state` | コントローラが購読 | |
| `playback.current()` | `playback:current` | | 後から開いたコントローラの初期表示用 |

`PlaybackCommand` の一覧は [src/types.ts](../src/types.ts) を参照。
`next`/`prev` は**コンテンツ単位**、`advance`/`back` は**コンテンツ内部**（スライドのページなど）です。

`exp*`（`expText` / `expRun` / `expFocus` / `expPick` / `expReset`）は**体験①②の中身**を動かします。
新しいチャネルは足さず、表示中の体験が `playback.onCommand` を自分でも購読して受け取ります
（[src/player/useExperience.ts](../src/player/useExperience.ts)）。折り返し `PlaybackState.experience`
に入力文・単語・候補を載せて配信し、コントローラはそれを見てボタンを組み立てます。

## controller

| API | チャネル | 説明 |
| --- | --- | --- |
| `controller.setTyping(on)` | `controller:typing` | 入力欄にフォーカスがある間はショートカット横取りを止める |
| `controller.exists()` | `controller:exists` | 進行画面が ◀▶ ボタンを出すかの判断に使う |
| `controller.onPresence(cb)` | `controller:presence` | コントローラの開閉時に配信 |

## auth（ユーザーと権限）

| API | チャネル | 包む | 説明 |
| --- | --- | --- | --- |
| `auth.state()` | `auth:state` | | `{ enabled, current }`。`enabled: false` は認証を使っていない初期状態 |
| `auth.role()` | `auth:role` | | 実効ロール（未認証の初期状態は `owner`） |
| `auth.login(id, pin)` | `auth:login` | ✓ | |
| `auth.logout()` | `auth:logout` | | |
| `auth.list()` | `auth:list` | | **`id` / `name` / `role` だけ**。ハッシュは返しません |
| `auth.add(name, pin, role)` | `auth:add` | ✓ | 1人目は必ずオーナー |
| `auth.setRole(id, role)` | `auth:setRole` | ✓ | |
| `auth.setPin(id, pin)` | `auth:setPin` | ✓ | 自分の分は自分で変えられる |
| `auth.remove(id)` | `auth:remove` | ✓ | |
| `auth.reveal()` | `auth:reveal` | | users.json をファイラで表示 |

詳細は [permissions.md](permissions.md)。

## results

| API | チャネル | 説明 |
| --- | --- | --- |
| `results.append(record)` | `result:append` | `results.jsonl` に 1 行追記 |
| `results.list()` | `result:list` | |
| `results.exportCsv()` | `result:exportCsv` | BOM 付き UTF-8。保存先パスを返す（キャンセルで `null`） |
| `results.clear()` | `result:clear` | **確認ダイアログ＋バックアップ付き**。[data.md](data.md) 参照 |

## 追加するときのチェックリスト

1. `src/types.ts` に型を足す（main / renderer 双方が参照する唯一の場所）
2. `electron/main.ts` の `registerIpc()` にハンドラを足す。失敗しうるなら `asResult` で包む
3. `electron/preload.ts` の `api` に足す。`asResult` で包んだなら `unwrap` する
4. レンダラから `api.xxx` で呼ぶ。`OcApi` は `typeof api` なので型定義の二重管理は不要
