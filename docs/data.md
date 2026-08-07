# データとスキーマ

## 保存先

すべて `app.getPath('userData')` の下です。

| OS | 場所 |
| --- | --- |
| macOS | `~/Library/Application Support/open-campus-llm-exhibit/` |
| Windows | `%APPDATA%\open-campus-llm-exhibit\` |

| ファイル / ディレクトリ | 中身 |
| --- | --- |
| `config.json` | 設定・コンテンツ・シナリオ（**アプリの状態のほぼ全部**） |
| `assets/` | 取り込んだ動画・PDF・画像・音声。スライド本文は config.json 側に入る |
| `openai.key` | OpenAI API キー。`safeStorage` で暗号化 |
| `results.jsonl` | 集計ログ（1行1レコード） |
| `results-YYYYMMDD-HHMMSS.jsonl` | リセット時の自動バックアップ |
| `cache/` | 埋め込みのキャッシュ |
| `models/` | Ruri v3 のモデルとトークナイザ（[nlp.md](nlp.md)） |

リポジトリ直下の `contents/` は**ユーザーが自分で置く素材の場所**で、アプリは直接読みません（git 上は空です）。

## config.json

型は [src/types.ts](../src/types.ts) が正です。ここでは構造だけ示します。

```jsonc
{
  "version": 1,
  "samplesVersion": 2,          // 取り込み済みの同梱教材の版
  "settings": {
    "chatModel": "gpt-4o-mini",
    "embeddingModel": "text-embedding-3-small",
    "exhibitTitle": "…",        // 進行画面の見出し
    "fullscreen": true,
    "showHints": true,          // コントローラにキー一覧を出すか
    "preferExternalDisplay": true,
    "showController": true,
    "attributeOptions": ["高校1年", "高校2年", …]  // コントローラの属性記録の区分
  },
  "contents":  [ /* Content[] — 部品。8種類 */ ],
  "scenarios": [ /* Scenario[] — contents を並べた展示の流れ */ ],
  "activeScenarioId": "…"
}
```

### contents と scenarios の関係

**コンテンツは部品、シナリオは並び順**です。1 つのコンテンツを複数のシナリオから参照できます。

```ts
interface ScenarioStep { id: string; contentId: string; enabled: boolean }
```

進行画面は `enabled` なステップだけを取り出し、`contentId` が実在するものに絞ります
（削除されたコンテンツを参照していても落ちません）。各種別のフィールドは
[content-types.md](content-types.md) を参照。

### 保存の作法

- 書き込みは `.tmp` に書いてから `rename` します（途中で落ちても壊れない）
- 設定画面は 500ms デバウンスで自動保存します。保存ボタンはありません
- 保存すると**全ウィンドウに `config:changed`** が飛びます。展示中の変更も即反映されます

## マイグレーション

`loadConfig()` は読むたびに `migrate()` を通し、**変換が起きたらその場で書き戻します**
（[electron/config.ts](../electron/config.ts)）。やっていることは 3 つです。

1. **未知の `type` のコンテンツを削除**し、それを参照するシナリオのステップも外す
   （廃止した「来場証明書」の名残を掃除するための処理）
2. **新しく増えたフィールドを `??=` で補完**する。例：`tokenizerMode ??= 'gpt'`
3. 同梱サンプル教材の取り込み（下記）

> **フィールドを追加したら `migrate()` にも 1 行足してください。**
> 既存ユーザーの config.json にはそのキーが無いので、`undefined` のまま画面に渡ると落ちます。

旧形式からの本格的な変換が 1 つだけ残っています。スライド本文をかつて `assets/*.md` に
置いていたものを `inlineText` に取り込む処理です（`c.inlineText === undefined` の分岐）。

### 同梱サンプル教材

`src/defaults.ts` の `SAMPLES_VERSION` を上げると、既存環境にも起動時に配られます。
判定は 2 段階です。

| config の状態 | 動作 |
| --- | --- |
| v1 時代の初期サンプルのまま、何も編集していない | 教材一式を**入れ替える**（重複を避けるため） |
| 自作のコンテンツやシナリオがある | 足りない教材だけ**追加**する（既存は一切消さない） |

「編集していない」の判定は `isUntouchedV1Samples()` が名前の集合と中身の薄さで行います。
追加分の重複判定は `sampleId` で行うので、一度消した教材が復活することはありません。

## results.jsonl

1 行 1 レコードの JSON Lines です。追記のみで、書き換えはしません。

```ts
interface ResultRecord {
  ts: string;                                      // ISO8601
  scenarioId: string | null;
  contentId: string;
  kind: 'quiz' | 'survey' | 'game' | 'attribute';
  payload: unknown;                                // kind ごとに形が違う
}
```

`payload` の形は記録側のコードが正です。

| kind | 記録する場所 | payload |
| --- | --- | --- |
| `quiz` | [QuizStep.tsx](../src/player/QuizStep.tsx) | `{ question, choice, correct }` — 1問ごと1行 |
| `game` | [GameStep.tsx](../src/player/GameStep.tsx) | `{ context, choice, correct }` — 1問ごと1行 |
| `survey` | [SurveyStep.tsx](../src/player/SurveyStep.tsx) | `{ people, answers: [{ question, choice, count }] }` — 1グループ1行 |
| `attribute` | [AttributePanel.tsx](../src/controller/AttributePanel.tsx) | `{ counts: { 区分: 人数 }, people, memo }` — 1グループ1行 |

`attribute` だけは来場者の操作ではなく、**運営がコントローラから手で入れる**記録です。
0 人の区分は `counts` に含めません。

### CSV 書き出し

`ts,kind,scenarioId,contentId,payload` の 5 列で、payload は JSON 文字列のまま 1 セルに入ります。
Excel で文字化けしないよう BOM を付けています。

### リセット（フェイルセーフ）

`results.clear()` は 3 段構えです。

1. **件数を出した OS のモーダル**で確認する
2. **既定ボタンをキャンセルにする**（`defaultId: 0` かつ `cancelId: 0`）。Enter 連打で消えない
3. 消す直前に `results-<日時>.jsonl` へ**必ずコピー**する

戻り値の `ClearResult` に退避先の絶対パスが入るので、設定画面はそれを「バックアップの場所を開く」
ボタンとして出します。0 件のときはバックアップを作らずファイルごと削除します。

## cache/

埋め込みは語数が多いと取得に時間がかかるので、`userData/cache` に保存します。
キーの組み立ては [Interactive1Step.tsx](../src/player/Interactive1Step.tsx) にあります。

```
emb_<プール名>_ruri-<サイズ>          … 例: emb_llmjp_ruri-130m
emb_<プール名>_<モデル名>_<次元数>     … 例: emb_curated_text-embedding-3-small_256
```

読み込み時は「語数が一致し、先頭の語も一致する」ときだけ使います。語彙を変更したら
自然に作り直される仕組みです。壊れた JSON は無視して取り直します。

**キャッシュを消したいとき**は `userData/cache` を削除すれば作り直されます。

## API キー

- `config.json` には**入りません**。`userData/openai.key` に `safeStorage.encryptString` で保存します
- レンダラからは `key.status()` で「保存済みか」「暗号化が効いているか」しか見えません。
  **キー本体をレンダラに渡す API はありません**
- API 呼び出しはすべてメインプロセス側（[openai.ts](../electron/openai.ts)）で行い、
  レンダラは結果だけ受け取ります
