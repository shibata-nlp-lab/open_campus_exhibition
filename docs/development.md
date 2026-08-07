# 開発ガイド

## セットアップ

```bash
npm install
npm run dev
```

必要なのは Node 20 以上です。`postinstall` で [scripts/fix-macos-electron.mjs](../scripts/fix-macos-electron.mjs)
が走り、macOS の Electron バイナリを署名し直します（Gatekeeper 対策。README 参照）。

> **プロジェクトを iCloud Drive 配下に置かないでください。**
> `~/Documents` や `~/Desktop` は既定で同期対象です。`node_modules` の読み出しが同期待ちになり、
> vite のビルドが 4 秒から 2 分半に伸びたり、`ETIMEDOUT: connection timed out, read` で
> ビルドが落ちたりします。`git add` が `mmap failed` で失敗することもあります。
> `~/dev/` のような同期外に置いてください。

## npm スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | vite dev server + esbuild watch + Electron 自動再起動 |
| `npm run build` | `dist/main`（esbuild）と `dist/renderer`（vite）を作る |
| `npm start` | ビルドして Electron で起動 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest（1回だけ実行）。CI でも走ります |
| `npm run test:watch` | 変更を監視して再実行 |
| `npm run dist:mac` / `dist:win` | 配布ファイルを `release/` に作る |
| `npm run fix-electron` | Electron バイナリを署名し直す |

`npm run dev` はメイン側（`electron/`）を書き換えると Electron を再起動し、
レンダラ側（`src/`）は HMR で差し替わります。**メイン側の変更は再起動を待つ**必要があります。

## ビルドの構造

```
electron/{main,preload}.ts ──esbuild──▶ dist/main/*.js      cjs / node20
src/**                     ──vite────▶ dist/renderer/**     chrome120
```

- `electron` `@huggingface/transformers` `onnxruntime-node` `sharp` は
  **バンドル対象外**です（ネイティブバイナリを含むため `node_modules` から読ませます）
- electron-builder の出力先は `release/` です。`dist/` はアプリのビルド出力で、
  かつ `files: ["dist/**/*"]` として梱包対象なので、ここに成果物を出すと衝突します

### scripts/build.mjs の入口判定

`dev.mjs` から import しても走らないよう、直接実行のときだけビルドします。

```js
// Windows のパスは file:///D:/... になるため、文字列連結で比較すると一致せず素通りする
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
```

以前ここを `` `file://${process.argv[1]}` `` と書いていたため、**Windows の CI で
build.mjs が何もせず終了し、空の asar が梱包される**という事故がありました
（[#2](https://github.com/shibata-nlp-lab/open_campus_exhibition/pull/2)）。

## テスト

Vitest。`test/` に置き、Node 環境で動かします（DOM も Electron も起動しません）。

```bash
npm test
npm test -- test/config.migrate.test.ts   # 1ファイルだけ
```

**「壊れても人の目では気づけないもの」に絞ってあります。** 見た目や操作感は対象外です。

| 対象 | なぜ守るか |
| --- | --- |
| `migrate()` | 既存ユーザーの config を起動時に書き換える。壊れると展示データが失われ、しかも新規インストールでは再現しない |
| `tokenizeLlmJp()` | 自前 Viterbi。間違っていても「それっぽい分割」が出るので目視で気づけない |
| IPC チャネル名 | preload と main の文字列の二重管理。typo は型で防げず、実行時に静かに失敗する |
| `isJapaneseVocabToken()` | 緩むと来場者の画面に中国語スパムが出る |
| `resultsToCsv()` | 引用符のエスケープはバグりやすい |

`test/contract.ipc.test.ts` はコードを実行せず、`preload.ts` と `main.ts` を読んで
チャネル名を突き合わせる静的なテストです。レンダラが `ipcRenderer` を直接使っていないことも
ここで見ています。

テストしやすくするために、純粋な処理は UI やファイル IO から切り出してあります
（`src/lib/markdown.ts` `src/lib/time.ts` `electron/csv.ts` `electron/ruriTokens.ts`）。
**新しく複雑な判断を書くときは、まず純粋関数として切り出せないか考えてください。**

`electron/config.ts` は `app.getPath` を使うので、テスト側で `vi.mock('electron')` して
一時ディレクトリに差し替えています。

> Vitest は **3 系に固定**しています。4 系は vite 8（rolldown）を抱き込み、その optional peer
> dependency である esbuild の扱いが npm のバージョンで変わるため、手元（npm 11）で作った
> lock ファイルを CI（npm 10）の `npm ci` が「不足あり」と判断して落ちます。

コンポーネントテスト（jsdom + Testing Library）はまだありません。追加するなら、
集計に残る値（`record()` に渡す payload）から始めるのが費用対効果が高いはずです。

## CI / リリース

| ワークフロー | 契機 | 内容 |
| --- | --- | --- |
| [ci.yml](../.github/workflows/ci.yml) | main への push / PR | 型チェック + テスト + ビルド（1〜2分） |
| [release.yml](../.github/workflows/release.yml) | `v*` タグの push / 手動実行 | mac(arm64) と win(x64) を並列ビルド。タグなら Release に添付 |

```bash
npm version patch
git push --follow-tags
```

10〜15 分で Releases に dmg / zip / exe が並びます。手動実行の場合は Release を作らず
Artifacts だけ残ります（**`workflow_dispatch` は既定ブランチからしか実行できません**）。

### 署名について

Apple Developer ID を持っていないため、macOS 版は [scripts/adhoc-sign.mjs](../scripts/adhoc-sign.mjs)
（`afterPack` フック）で**アドホック署名**しています。electron-builder は `identity: null` を
指定すると署名処理そのものを飛ばすので、**このフックが無いと未署名のままになります**。
受け取る人の初回起動手順は README を参照してください。

## 落とし穴

コードを読んだだけでは気づきにくいものを挙げます。

### config に新しいフィールドを足したとき

[electron/config.ts](../electron/config.ts) の `migrate()` に `??=` を 1 行足してください。
既存ユーザーの config.json にはそのキーが無いので、`undefined` のまま画面に渡ると落ちます。

### コンテンツ種別を足したとき

`migrate()` の `known` セットにも足してください。ここに無い type は
「廃止された種別」とみなされて起動時に削除されます。詳細は [content-types.md](content-types.md)。

### コントローラで新しい入力欄を作るとき

メインプロセスがキーを横取りしているので、**そのままだと "n" や "s" が進行操作になります**。
`ControllerApp` の `focusin`/`focusout` が `INPUT` / `TEXTAREA` / `contentEditable` を
見て `controller:typing` を送るので、**この 3 つのどれかであれば自動で守られます**。
独自のキー入力コンポーネントを作る場合は自分で `api.controller.setTyping()` を呼んでください。

### React StrictMode

開発時は mount → cleanup → 再 mount が走ります。`alive` のような
「生きているか」フラグを ref で持つ場合は、**mount 時に必ず true に戻して**ください
（[Interactive2Step.tsx](../src/player/Interactive2Step.tsx) にコメント付きの実例があります）。

### 失敗しうる IPC ハンドラ

`ipcMain.handle` で reject すると、想定内の失敗でもメインプロセスのログにスタックトレースが出ます。
`asResult` + `unwrap` の規約に揃えてください（[ipc.md](ipc.md)）。

### sharp のアーキテクチャ

Rosetta の x64 Node で `npm ci` すると sharp の x64 版が入り、arm64 アプリに x64 バイナリが同梱されます。
wasm フォールバックで動きはしますが遅くなります。`node -p process.arch` を確認してください。

## コードの書き方

CLAUDE.md にある方針に加えて、このリポジトリの実際の慣習です。

- **コメントは日本語で、「なぜ」を書く。** 何をしているかはコードを読めば分かります。
  上のような落とし穴には必ず理由のコメントが付いています
- **型は `src/types.ts` に集約する。** main と renderer が同じファイルを import します。
  preload の `OcApi` は `typeof api` なので、API の型を二重に書く必要はありません
- **展示中に落とさない。** 未設定・失敗は案内を出して次へ進めるようにします。
  例外を投げて画面を白くするのは最後の手段です
- **来場者に見せる情報と運営向けの情報を混ぜない。** 進行メモ・キー一覧・内部進捗は
  コントローラにだけ出します
- **テストは「壊れても人の目では気づけないもの」に絞る。** 見た目は対象外です（下記）
