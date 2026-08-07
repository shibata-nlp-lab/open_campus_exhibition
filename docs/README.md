# 開発ドキュメント

このディレクトリは**コードをさわる人向け**の資料です。
展示の使い方・当日の運用・配布ビルドの手順は、リポジトリ直下の [README.md](../README.md) にあります。

| 文書 | 内容 |
| --- | --- |
| [architecture.md](architecture.md) | プロセスとウィンドウの構成、起動から表示までの流れ、キー入力が二系統ある理由 |
| [ipc.md](ipc.md) | `window.api`（preload）の全 API とメインプロセス側ハンドラの対応表 |
| [data.md](data.md) | `config.json` のスキーマ、保存先のファイル群、集計ログの形式、マイグレーション |
| [content-types.md](content-types.md) | コンテンツ 8 種の型と描画側の挙動、種別を追加する手順 |
| [permissions.md](permissions.md) | 展示員ユーザーと役割ごとの権限、PIN の扱い |
| [nlp.md](nlp.md) | トークナイザ 3 種と埋め込み 2 種の実装、キャッシュ、オフライン時の縮退 |
| [development.md](development.md) | 環境構築、npm スクリプト、テスト、CI/リリース、既知の落とし穴、コードの書き方 |

## 3分でわかる全体像

Electron アプリで、**1つのレンダラのバンドルを 3 つの画面として使い回します**。
どの画面になるかは URL のハッシュ（`#/settings` / `#/player` / `#/controller`）だけで決まります。

```
設定画面 ──保存──▶ config.json ──読込──▶ 進行画面（来場者に見せる／全画面）
                                              │  状態を publish
                                              ▼
                                        コントローラ画面（手元で操作）
```

- **状態の持ち主は進行画面**です。コントローラは状態を持たず、コマンドを送って結果を受け取るだけの薄い画面です
- **設定の持ち主は `config.json`** です。設定画面が保存するとメインプロセスが全ウィンドウに `config:changed` を投げ、開いている進行画面にもその場で反映されます
- **ネットワークが要るのは 2 種類のコンテンツだけ**です（インタラクティブ1/2）。しかもどちらも失敗時は縮退して動き続けます

まずは [architecture.md](architecture.md) から読んでください。

## コードの地図

```
electron/          メインプロセス（Node。ファイル・ウィンドウ・外部API）
  main.ts          ウィンドウ生成、IPC 登録、カスタムプロトコル、キー横取り
  config.ts        userData 以下の読み書き（config / assets / cache / 集計ログ）
  openai.ts        OpenAI API 呼び出し（Chat Completions / Embeddings）
  localEmbed.ts    ローカルの Ruri v3（埋め込み・トークナイズ）
  preload.ts       contextBridge で window.api を生やす。レンダラの唯一の外部窓口

src/
  types.ts         main / renderer 共通の型。スキーマの定義はここが正
  defaults.ts      既定値・空テンプレート・同梱サンプル教材の取り込み
  main.tsx         ハッシュを見て 3 画面のどれかを描く入口
  lib/             トークナイザ（o200k / llm-jp）、ベクトル演算、api ラッパ
  player/          進行画面。コンテンツ種別ごとに 1 ファイル
  controller/      コントローラ画面
  settings/        設定画面（タブごとに 1 ファイル、editors.tsx が種別ごとの編集 UI）
  content/         同梱教材と語彙データ

scripts/           ビルド・開発サーバ・署名まわりの Node スクリプト
.github/workflows/ CI（型チェック＋ビルド）とリリース（配布ファイル生成）
```
