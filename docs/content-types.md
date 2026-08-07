# コンテンツ種別

コンテンツは展示の部品です。8 種類あり、`type` フィールドで判別する判別可能ユニオン
（[src/types.ts](../src/types.ts) の `Content`）になっています。

```
type ──▶ 型 ──────────────────▶ 描画（src/player/）──▶ 編集 UI（src/settings/editors.tsx）
```

| type | 型 | 描画 | ネットワーク | 集計 |
| --- | --- | --- | --- | --- |
| `video` | `VideoContent` | [VideoStep](../src/player/VideoStep.tsx) | 不要 | — |
| `slide` | `SlideContent` | [SlideStep](../src/player/SlideStep.tsx) | 不要 | — |
| `quiz` | `QuizContent` | [QuizStep](../src/player/QuizStep.tsx) | 不要 | `quiz` |
| `interactive1` | `Interactive1Content` | [Interactive1Step](../src/player/Interactive1Step.tsx) | **要**（縮退あり） | — |
| `interactive2` | `Interactive2Content` | [Interactive2Step](../src/player/Interactive2Step.tsx) | **要**（縮退あり） | — |
| `game` | `GameContent` | [GameStep](../src/player/GameStep.tsx) | 不要 | `game` |
| `survey` | `SurveyContent` | [SurveyStep](../src/player/SurveyStep.tsx) | 不要 | `survey` |
| `standby` | `StandbyContent` | [StandbyStep](../src/player/StandbyStep.tsx) | 不要 | — |

共通フィールドは `ContentBase` です。`note` は**コントローラにだけ**出る進行用の覚え書きで、
来場者側には出しません。`sampleId` は同梱教材の重複取り込みを防ぐための識別子です。

## StepProps — 描画側の共通インタフェース

すべてのステップコンポーネントが同じ props を受け取ります（[PlayerApp.tsx](../src/player/PlayerApp.tsx)）。

```ts
interface StepProps<T extends Content = Content> {
  content: T;
  config: AppConfig;
  onFinish: () => void;                                   // 次のコンテンツへ（最後なら最初に戻る）
  record: (kind, payload) => void;                        // 集計ログに1行追記
  onDetail?: (detail: string | null) => void;             // コントローラに出す内部進捗（「3/12ページ」など）
  runKey: number;                                         // やり直しのたびに増える
}
```

`runKey` はコンポーネントの `key` に含まれているので、`R`（最初から）を押すと
**内部状態ごと作り直され**ます。ステップ側で明示的にリセット処理を書く必要はありません。

## 種別ごとの要点

### video

`autoAdvance` かつ `loop` でないときだけ、再生終了で次へ進みます。クリックで一時停止。
未設定なら「動画が未設定です」の案内を出して次へ進めます（**落とさない**）。

### slide

`format` が `markdown` / `pdf` / `html` の 3 通り。markdown はさらに取得元が 2 通りあります。

| markdownSource | 本文の置き場所 |
| --- | --- |
| `inline` | `inlineText`（**config.json の中**。assets には置かない） |
| `file` | `externalPath`（ユーザーの .md を絶対パスで参照。Marp で編集した内容が毎回反映される） |

Marp 対応として、フロントマター（先頭の `---` ブロック）と `<!-- -->` のディレクティブを落とし、
`^---$` でページ分割します。外部 .md の相対パス画像は `ocfile://` に書き換えて表示します
（`resolveRelativeAssets`）。**Marp のテーマ CSS は当たりません**。デザインを保ちたいなら PDF 形式で登録します。

PDF は pdfjs-dist でページ送りします。`autoAdvanceSec` は markdown / pdf でのみ有効です。

### quiz / game

どちらも完全オフラインです。1 問ごとに `record()` を呼ぶので、
**途中で展示を止めても回答済みの分は残ります**。

- quiz … 設定画面で問題・選択肢・正解・解説を作る。`timeLimitSec` は 0 で無制限
- game … 「次の単語当て」。`choices[].prob` は解説表示用の数値で、正誤判定には使いません

### survey

来場者ではなく**その場の人数を数えて入れる**設計です。`people`（人数）を ＋/− で変えながら、
選択肢ごとに人数を積みます。`kind` が `scale` の設問は 1..5 固定。
1 グループ分をまとめて 1 行として記録します。

### standby

説明の合間の「お待ちください」画面。**2 通りの出し方**があります。

1. **シナリオのステップとして**配置する（`StandbyStep`）
2. **オーバーレイとして**重ねる（`S` キー／コントローラのボタン → `StandbyView` を上に描く）

オーバーレイのときは「シナリオ内の最初の standby コンテンツ」の設定（BGM 含む）を流用し、
無ければ既定の文言を使います（`PlayerApp.overlayStandby`）。

**BGM は設定に関わらず必ずループします。** 途中で切れて無音になると来場者から「終わった」ように
見えるためで、設定画面のループ切替も待機画面では出しません。

**設定画面から「⏸ 待機画面で開始」で、待機画面を出した状態のまま進行画面を開けます。**
本編に入るときはコントローラのシナリオ切替（`{ type: 'scenario', id }`）を使います。
来場者側の画面には「再開する」ボタンを出しません（コントローラがあるときは隠します）。

`nextStartMode` は次の回の開始時刻の見せ方で、`hidden` / `undecided` / `time` の 3 通り。
`time` のときは `HH:MM` を出し、残り分数も表示します（過ぎていたら出しません）。
この値は**コントローラから書き換えられます**。専用の IPC ではなく config を保存し直す実装なので、
書き換えた内容はそのまま次回も残ります。

`autoAdvanceSec` が 0 より大きいとカウントダウンして自動で次へ進みます。

### interactive1 / interactive2

唯一ネットワークを使う 2 つです。どちらも**失敗したらオフライン用の縮退動作に落ちて、
展示は止まりません**（画面にその旨を明示します）。

- interactive1 … 入力文をトークン分割 → ベクトル化 → 近いことば・ヒートマップ・PCA 2D
- interactive2 … 次トークンの候補と確率を `top_logprobs` で出し、来場者が選んで文を伸ばす

トークナイザと埋め込みの選択肢は [nlp.md](nlp.md) にまとめています。

## 種別を追加する手順

1 種別あたり、触るのは 5 か所です。

1. **[src/types.ts](../src/types.ts)**
   `ContentType` に文字列を足し、`XxxContent extends ContentBase` を定義して `Content` ユニオンに加える
2. **[src/defaults.ts](../src/defaults.ts)**
   `CONTENT_LABELS` に日本語名、`createContent()` に空テンプレートを足す。
   この 2 つは `Record<ContentType, …>` と戻り値の型で守られているので、忘れると型チェックで落ちます
3. **[src/player/XxxStep.tsx](../src/player/)**
   `StepProps<XxxContent>` を受け取るコンポーネントを作る。
   ページ送りが要るなら `useStepKeys`、音を鳴らすなら `useAudio` を使う
4. **[src/player/PlayerApp.tsx](../src/player/PlayerApp.tsx)**
   `body` の `switch` に 1 行足す。**ここは型で漏れを検出できません**（分岐が無いと `undefined` になり、
   JSX としては合法なので通ってしまいます）。画面が真っ白になったらここを疑ってください
5. **[src/settings/editors.tsx](../src/settings/editors.tsx)**
   編集 UI を作り、種別ごとの分岐に足す

加えて、**[electron/config.ts](../electron/config.ts) の `migrate()` にある `known` セットに
新しい type を足してください**。ここに無い type は「廃止された種別」とみなされて
次回起動時に削除されます。
