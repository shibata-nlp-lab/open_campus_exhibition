# コンテンツ種別

コンテンツは展示の部品です。9 種類あり、`type` フィールドで判別する判別可能ユニオン
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
| `branch` | `BranchContent` | [BranchStep](../src/player/BranchStep.tsx) | 不要 | — |
| `standby` | `StandbyContent` | [StandbyStep](../src/player/StandbyStep.tsx) | 不要 | — |

共通フィールドは `ContentBase` です。`note` は**コントローラにだけ**出る進行用の覚え書きで、
来場者側には出しません。`sampleId` は同梱教材の重複取り込みを防ぐための識別子です。

## StepProps — 描画側の共通インタフェース

すべてのステップコンポーネントが同じ props を受け取ります（[PlayerApp.tsx](../src/player/PlayerApp.tsx)）。

```ts
interface StepProps<T extends Content = Content> {
  content: T;
  config: AppConfig;
  onFinish: () => void;                                   // 次のコンテンツへ（最後なら待機画面）
  record: (kind, payload) => void;                        // 集計ログに1行追記
  onDetail?: (detail: string | null) => void;             // コントローラに出す内部進捗（「3/12ページ」など）
  runKey: number;                                         // やり直しのたびに増える
}
```

`runKey` はコンポーネントの `key` に含まれているので、`R`（最初から）を押すと
**内部状態ごと作り直され**ます。ステップ側で明示的にリセット処理を書く必要はありません。

`onFinish` は**最後のコンテンツでは待機画面に移ります**（`N` キー、コントローラの「次へ」、
画面下の ▶ も同じ）。展示はこの繰り返しで回すので、終わったところで黙って止まるより
待機画面が出たほうが自然なためです。そこから次の回に入るときは、
コントローラのシナリオ切替を使います。
ただし [branch](#branch) から飛んできている間だけは、**分岐画面へ帰る**のが優先されます。

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

**フロントマターに `marp: true` か `theme:` があるものは [src/lib/marp.ts](../src/lib/marp.ts) が
Marp Core に渡します。** テーマ CSS（`default` / `gaia` / `uncover` と、設定画面で登録した自作テーマ）が
そのまま効きます。これらは Marp のつもりで書かれた .md だけに付くフラグなので、
**付いていない既存の教材は従来の簡易描画のままで、見た目が変わりません**。

Marp Core は 3.5MB あるので動的 import にしてあり、Marp のスライドを開くまで読み込みません。
出力は `htmlAsArray` でページごとに受け取り、CSS が `div.marpit > svg > …` を前提にしているので
`div.marpit` で包んで描きます。テーマ CSS は svg を `100vw × 100vh` にするため、
アプリ側の CSS で `100%` に上書きしています。
外部フォントの `@import` は落とします（回線の無い会場で待たされないため）。

どちらも無い場合の簡易描画は [src/lib/markdown.ts](../src/lib/markdown.ts) の `parseMarp()` が解釈します。
フロントマターの `style:`、本文中の `<style>` / `<style scoped>`、
ページごとのディレクティブ（`_class` など）を取り出し、
`^---$` でページに割ります（コードフェンスの中の `---` では割りません）。
外部 .md の相対パス画像は `ocfile://` に書き換えます（`resolveRelativeAssets`）。

CSS はいずれも `@scope (.marp-scope) { … }` で囲ってから注入するので、**スライドの CSS が
アプリの他の画面へ漏れません**。`<style scoped>` はそのページの分だけ貼り、
それ以外はスライド全体に効かせます（Marp と同じ）。
ページ本文は `<section class="…">` で包むため、`section.title * { … }` のような
Marp 由来のセレクタがそのまま効きます。アプリ側が section に当てている既定値は
`:where()` で詳細度 0 にしてあるので、スライド側の `section { … }` が素直に上書きできます。

**フロントマターは `key: value` を 1 つ以上含むときだけフロントマターとして扱います。**
先頭の `---` をページ区切りのつもりで書いた .md を、次の `---` まで丸ごと食べて
真っ白にしてしまわないためです（Marp 本体はこの場合 1 ページ目が空になります）。

簡易描画では `theme:` は当たりません（テーマを使うなら Marp Core 側に回ります）。

PDF は pdfjs-dist でページ送りします。`autoAdvanceSec` は markdown / pdf でのみ有効です。

### quiz / game

どちらも完全オフラインです。1 問ごとに `record()` を呼ぶので、
**途中で展示を止めても回答済みの分は残ります**。

- quiz … 設定画面で問題・選択肢・正解・解説を作る。`timeLimitSec` は 0 で無制限
- game … 「次の単語当て」。`choices[].prob` は解説表示用の数値で、正誤判定には使いません

どちらも選択肢は**つまみ（⠿）のドラッグで並べ替え**られます。並べ替えると `answerIndex` が
ずれて正解が別の選択肢になってしまうので、[src/lib/reorder.ts](../src/lib/reorder.ts) の
`shiftIndex()` で追従させています（全パターンをテストで固定）。

### survey

来場者ではなく**その場の人数を数えて入れる**設計です。`people`（人数）を ＋/− で変えながら、
選択肢ごとに人数を積みます。`kind` が `scale` の設問は 1..5 固定。
1 グループ分をまとめて 1 行として記録します。

### branch

**説明が終わったあと、体験したい人だけを前の体験へ戻す**ための分かれ道です。
説明の途中で体験を挟むと全員が待たされるので、希望者だけが進む出口をシナリオの終盤に置けるようにしています。

```
… → 説明スライド → ［体験してみますか？］ ─「体験①」─▶ 体験①
                          ▲   ▲   ▲       └「体験②」─▶ 体験②  ┐
                          │   │   └────────────────────────────┘
                          │   └──────── 体験の「次へすすむ」で帰る
                          │
                     「ここで終わる」 → 次のコンテンツ（待機画面など）
```

シナリオの並びとしては**一本道のまま**で、行き来はステップ番号のジャンプで実現しています。
帰ってくるのは元の分岐画面なので、**続けて別のものを選べます**。

`targets` に**戻り先を何個でも並べられます**（体験①・体験②・ゲームを並べる、など）。
ボタンは並べた順に出ます。

| フィールド | 意味 |
| --- | --- |
| `targets[].contentId` | 戻る先のコンテンツ |
| `targets[].label` | ボタンの文言。**空ならコンテンツ名**がそのまま出る |

- 戻り先は**この分岐より前にあるもの**を優先して探し、前に無ければ後ろも見ます
  （[src/lib/branch.ts](../src/lib/branch.ts) の `findBranchTarget()`）。
  同じ体験が 2 か所にあるときは直前に見せたほうへ帰します
- シナリオ内に見つからない戻り先は、**ボタンごと出しません**。押しても何も起きない状態が
  展示中はいちばん困るためです
- 戻り先が自分自身になる指定は無効です（抜けられなくなるため）

当初は戻り先が 1 つだけ（`targetContentId` / `goLabel`）でした。旧形式の config は
`migrate()` が 1 件の `targets` に畳み、旧フィールドを消します
（両方が残っていると、どちらを見ているのか分からなくなるため）。

戻っている間、[PlayerApp](../src/player/PlayerApp.tsx) は帰り先を `returnTo` で覚えています。
このとき「次へ」は**次のコンテンツではなく分岐画面へ帰り**ます（`N` キー・コントローラ・
体験側の「次へすすむ」すべて同じ）。「前へ」「最初から」「ステップ直接指定」「シナリオ切替」は
`returnTo` を捨てます — 進行係が手で動かしたあとに意図しない場所へ飛ぶほうが混乱するためです。

`returnTo` は `PlaybackState` にも載せていて、コントローラには
「↩ 体験に戻っています — 「次へ」で〜に帰ります」と出ます。戻った理由が分からないまま
画面が前に戻ったように見えるのを避けるためです。

### standby

説明の合間の「お待ちください」画面。**2 通りの出し方**があります。

1. **シナリオのステップとして**配置する（`StandbyStep`）
2. **オーバーレイとして**重ねる（`S` キー／コントローラのボタン → `StandbyView` を上に描く）

オーバーレイのときは「シナリオ内の最初の standby コンテンツ」の設定（BGM 含む）を流用し、
無ければ既定の文言を使います（`PlayerApp.overlayStandby`）。

**BGM は設定に関わらず必ずループします。** 途中で切れて無音になると来場者から「終わった」ように
見えるためで、設定画面のループ切替も待機画面では出しません。

**シナリオの最後で「次へ」を押すと、自動的にこの待機画面（オーバーレイ）になります。**

**設定画面から「⏸ 待機画面で開始」で、待機画面を出した状態のまま進行画面を開けます。**
本編に入るときはコントローラのシナリオ切替（`{ type: 'scenario', id }`）を使います。
来場者側の画面には「再開する」ボタンを出しません（コントローラがあるときは隠します）。

`nextStartMode` は次の回の開始時刻の見せ方で、`hidden` / `undecided` / `time` の 3 通り。
`time` のときは `HH:MM` を出し、残り分数も表示します（過ぎていたら出しません）。
この値は**コントローラから書き換えられます**。専用の IPC ではなく config を保存し直す実装なので、
書き換えた内容はそのまま次回も残ります。

`autoAdvanceSec` が 0 より大きいとカウントダウンして自動で次へ進みます。

### interactive1 / interactive2

ネットワークを使うことがある 2 つです。どちらも**失敗したらオフライン用の縮退動作に落ちて、
展示は止まりません**（画面にその旨を明示します）。
どちらもローカルのモデルを選べば通信なしで動きます（体験①は Ruri / llm-jp の埋め込み層、
体験②は llm-jp-3 本体）。

- interactive1 … 入力文をトークン分割 → ベクトル化 → 近いことば・ヒートマップ・PCA 2D
- interactive2 … 次トークンの候補と確率を出し、来場者が選んで文を伸ばす。
  取得元（`predictSource`）は OpenAI の `top_logprobs` か、**この PC で動かす日本語モデル**
  （llm-jp-3 の 150m / 440m / 980m と gemma-2-2b-jpn）の 2 通り

トークナイザと埋め込みの選択肢は [nlp.md](nlp.md) にまとめています。

**音声はコンテンツ単位ではなく画面単位で持ちます**（`screenAudio`）。この 2 つは 1 つのコンテンツの
中で画面が切り替わり、しかも来場者の操作次第で滞在時間が変わるので、通しで 1 本流すより
画面ごとにナレーションを当てられたほうが合うためです。

| type | キー | 画面 |
| --- | --- | --- |
| `interactive1` | `input` / `tokens` / `vectors` | 入力 ／ STEP 1 単語分割 ／ STEP 2 ベクトル化 |
| `interactive2` | `input` / `predict` / `pick` | 入力 ／ 最初の候補が出た画面 ／ 1語選んだあと |

`src` が空の画面では何も鳴りません。画面が切り替わると前の画面の音は止まります
（`useAudio` の依存が `src` なので、React が前の再生を後片付けしてから次を鳴らします）。
「もう一度」「入力しなおす」で戻ると、その画面の音は頭から鳴り直します。

既存の config には `screenAudio` が無いので `migrate()` が**キー単位で**補います
（丸ごと `??=` にすると、画面が増えたときに設定済みの config へ新しいキーが入りません）。

## 自動モード

人が付かずに回すモードです（設定画面「シナリオ」タブから開始、`A` キーで入り／切り）。
[src/player/useAuto.ts](../src/player/useAuto.ts) の `AutoContext` を各ステップが読み、
**自分で次へ進みます**。PlayerApp 側で一括して送るのではなく各ステップに任せているのは、
「次の画面」がコンテンツごとに違うためです（スライドはページ、体験①は phase、体験②は1語ごと）。

`useAutoTimer` は **音声が鳴り終わってから** `sec` 秒後に発火します。
`useAudio` の `ended` を合図にしていて、**音声が無い・ループする・再生に失敗した**場合は
最初から `ended = true` にします（そうしないと自動モードが止まります）。

| type | 自動モードでの動き | 秒数 |
| --- | --- | --- |
| `video` | 再生し終わったら次へ（`autoAdvance` の設定は見ない）。ループなら秒数で切り上げ | `autoSec` |
| `slide` | ページを送り、最後のページで次へ。`autoAdvanceSec` が 0 なら `autoSec` に落とす | `autoAdvanceSec` → `autoSec` |
| `quiz` / `game` / `survey` | 答える人がいないので、見せるだけ見せて次へ | `autoSec` |
| `interactive1` | `autoText` を入力 → 分割 → ベクトル化 → `autoTokenIndexes` を順にフォーカス → 次へ | `screenAutoSec[phase]` |
| `interactive2` | `autoSeed` を入力 → `autoPickIndex` の候補を `autoPickCount` 回選ぶ → 次へ | `screenAutoSec[phase]` |
| `branch` | 誰も押さなければ**待機画面へ**（次のコンテンツへは進めない） | `autoSec` |

体験①の**フォーカス移動だけは音声の終わりを待ちません**（`audioEnded: true` を渡す別のタイマー）。
1本のナレーションで複数の単語を順に説明する想定なので、鳴り終わるまで動かないと間に合いません。
最後の単語まで見せたあと、次のコンテンツへ進むときは音声の終わりを待ちます。

**自動モード中はコントローラの進行操作を止めます。** ボタンは `disabled`、キーは
メインプロセス側（`before-input-event`）で握りつぶします。**ボタンだけ止めてキーが通ると、
うっかり触って二重に進みます。** 解除（`A`）・全画面（`F`）・終了（`Esc`）だけは通します。

**分岐で「体験する」が押されたら自動モードを解除します**（`AutoContext.cancel`）。
人が操作を引き取ったのに裏で勝手に画面が進むのを避けるためです。
待機画面を重ねている間もタイマーは止まります。

体験①②は入力を来場者に頼れないので、`run()` / `start()` に文字列を直接渡します。
`setText` の反映を待つと、タイマーが先に発火したときに空文字で走って何も起きず、
**自動モードがそこで止まってしまう**ためです。

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
