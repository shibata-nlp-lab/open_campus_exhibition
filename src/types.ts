/** アプリ全体で共有する型定義（main / renderer 双方から import される） */

export type ContentType =
  | 'video'
  | 'slide'
  | 'quiz'
  | 'interactive1'
  | 'interactive2'
  | 'game'
  | 'survey'
  | 'branch'
  | 'standby';

export interface ContentBase {
  id: string;
  type: ContentType;
  /** 同梱サンプル由来のものに付く識別子。重複取り込みを防ぐために使う */
  sampleId?: string;
  /** 設定画面・シナリオ上での表示名 */
  name: string;
  /** 進行中に画面下部へ出す補足（任意） */
  note?: string;
}

/** BGM / ナレーション。assets 相対パス */
export interface AudioSetting {
  src: string | null;
  volume: number; // 0..1
  loop: boolean;
}

export interface VideoContent extends ContentBase {
  type: 'video';
  src: string | null;
  muted: boolean;
  loop: boolean;
  /** 再生終了で自動的に次のコンテンツへ */
  autoAdvance: boolean;
}

export type SlideFormat = 'markdown' | 'pdf' | 'html';

/**
 * markdown の取得元。
 * - inline: アプリ内で編集し assets に保存
 * - file:   ローカルの .md を絶対パスで参照（Marp で編集した内容が毎回そのまま反映される）
 */
export type MarkdownSource = 'inline' | 'file';

export interface SlideContent extends ContentBase {
  type: 'slide';
  format: SlideFormat;
  /** pdf / html のときの assets 相対パス */
  src: string | null;
  markdownSource: MarkdownSource;
  /** markdownSource==='inline' のときの本文（config.json に直接保存される） */
  inlineText: string;
  /** markdownSource==='file' のときの絶対パス */
  externalPath: string | null;
  audio: AudioSetting;
  /** 秒。0 で自動送りなし（markdown / pdf のみ有効） */
  autoAdvanceSec: number;
}

export interface QuizChoice {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  text: string;
  choices: QuizChoice[];
  answerIndex: number;
  explanation: string;
  imageSrc?: string | null;
}

export interface QuizContent extends ContentBase {
  type: 'quiz';
  questions: QuizQuestion[];
  /** 秒。0 で無制限 */
  timeLimitSec: number;
  showExplanation: boolean;
  audio: AudioSetting;
}

/**
 * 「意味が近いことば」を探す候補プール。
 * - curated:   同梱の厳選語彙（約120語）。結果が読みやすい
 * - tokenizer: o200k_base から抽出した日本語（約1,840語）。GPT系の実物だが中国語や5ch定型も混ざる
 * - llmjp:     llm-jp の語彙から抽出した日本語（頻度上位 6,000 語）。日本語モデルの語彙
 */
export type NeighbourSource = 'curated' | 'tokenizer' | 'llmjp';

/**
 * 入力文をどのトークナイザで分割するか。
 * - gpt:   o200k_base（GPT-4o の実物。日本語はほぼ1文字ずつに切れる）
 * - llmjp: llm-jp の SentencePiece Unigram（日本語向けなので単語単位で切れる）
 * - ruri:  Ruri v3 が実際に使うトークナイザ（ModernBERT-Ja 経由の Sarashina2 由来）。
 *          埋め込みも Ruri にしておくと、画面に見せる分割とモデル内部の分割が一致する。
 */
export type TokenizerMode = 'gpt' | 'llmjp' | 'ruri';

/**
 * ベクトル化（埋め込み）の取得元。
 * - openai: OpenAI Embeddings API（多言語・要APIキー）
 * - ruri:   ローカルの日本語モデル Ruri v3（初回だけモデルをダウンロード。以降はオフラインで高速）
 * - llmjp:  llm-jp の埋め込み層そのもの。トークンIDで表を引くだけなので、
 *           画面に出しているIDとベクトルの対応をそのまま見せられる
 */
export type EmbeddingSource = 'openai' | 'ruri' | 'llmjp';

/** Ruri v3 のモデルサイズ */
export type RuriSize = '30m' | '130m' | '310m';

/** 埋め込み層を借りてくる llm-jp-3 のモデルサイズ（大きいほど次元が高い） */
export type LlmJpSize = '150m' | '440m' | '1.8b';

/**
 * 「意味が近いことば」の数値の見せ方。
 * - relative: 1位を100%とした相対値。中心化すると値が小さくなるので順位が読みやすい
 * - cosine:   コサイン類似度そのもの。尺度は一定だが、1位でも 30% 程度になることがある
 */
export type SimilarityDisplay = 'relative' | 'cosine';

/**
 * 体験①の画面。音声を画面ごとに差し替えるために使う。
 * - input:   入力画面（トークン化する前）
 * - tokens:  単語分割の結果
 * - vectors: ベクトル化の結果
 */
export type Interactive1Phase = 'input' | 'tokens' | 'vectors';

/** 体験②の画面。input: 入力画面 / predict: 予測を回している画面 */
export type Interactive2Phase = 'input' | 'predict';

export interface Interactive1Content extends ContentBase {
  type: 'interactive1';
  prompt: string;
  placeholder: string;
  examples: string[];
  neighbourSource: NeighbourSource;
  tokenizerMode: TokenizerMode;
  embeddingSource: EmbeddingSource;
  ruriSize: RuriSize;
  llmjpSize: LlmJpSize;
  /** 近いことばの数値の出し方 */
  similarityDisplay: SimilarityDisplay;
  /** 単語の下に ID を出すか（来場者向けには不要なことが多い） */
  showTokenId: boolean;
  /**
   * 画面ごとの音声。src が空の画面では何も鳴らさない。
   * 画面が切り替わると前の画面の音は止まる（重なって鳴らない）。
   */
  screenAudio: Record<Interactive1Phase, AudioSetting>;
}

/**
 * 次トークンの確率をどこから取るか。
 * - openai: Chat Completions の top_logprobs（多言語・要APIキー・要通信）
 * - llmjp:  llm-jp-3 をこの PC で動かす（APIキー不要・通信なし。初回だけモデルを取得）
 */
export type PredictSource = 'openai' | 'llmjp';

export interface Interactive2Content extends ContentBase {
  type: 'interactive2';
  /** 次トークンの確率の取得元 */
  predictSource: PredictSource;
  prompt: string;
  placeholder: string;
  examples: string[];
  /** 表示する候補数（1..8 で API 上限は 20） */
  topK: number;
  /** 何トークンまで伸ばせるか */
  maxSteps: number;
  /** true: 常に1位を選ぶ / false: 来場者が選ぶ */
  autoPickTop: boolean;
  /** 画面ごとの音声。体験①と同じ扱い */
  screenAudio: Record<Interactive2Phase, AudioSetting>;
}

export interface GameChoice {
  text: string;
  /** 解説用に表示する確率 0..1 */
  prob: number;
}

export interface GameRound {
  id: string;
  /** 「___」の直前までの文脈 */
  context: string;
  choices: GameChoice[];
  answerIndex: number;
  explanation: string;
}

export interface GameContent extends ContentBase {
  type: 'game';
  rounds: GameRound[];
  timeLimitSec: number;
  /** 正解時の獲得点 */
  pointsPerCorrect: number;
}

export type SurveyQuestionKind = 'choice' | 'scale';

export interface SurveyQuestion {
  id: string;
  text: string;
  kind: SurveyQuestionKind;
  /** kind==='choice' のときの選択肢。scale は 1..5 固定 */
  choices: string[];
}

export interface SurveyContent extends ContentBase {
  type: 'survey';
  questions: SurveyQuestion[];
  /** 初期人数 */
  defaultPeople: number;
  audio: AudioSetting;
}

/**
 * 「体験してみますか？」の分かれ道。
 * 説明が終わったあと、希望する人だけ前の体験コンテンツへ戻すために置く。
 * 戻った先で「次へ」を押すと、次のコンテンツではなくこの画面に帰ってくる。
 */
export interface BranchContent extends ContentBase {
  type: 'branch';
  message: string;
  submessage: string;
  /**
   * 「体験する」で戻る先のコンテンツ。
   * シナリオ内に見つからないときはボタンを出さない（展示を止めないため）。
   */
  targetContentId: string | null;
  /** 戻るほうのボタンの文言 */
  goLabel: string;
  /** 先へ進むほうのボタンの文言 */
  stayLabel: string;
  audio: AudioSetting;
}

/** 次の回の開始時刻の見せ方 */
export type NextStartMode = 'hidden' | 'undecided' | 'time';

/** 説明の合間に出す「お待ちください」画面 */
export interface StandbyContent extends ContentBase {
  type: 'standby';
  message: string;
  submessage: string;
  /** 現在時刻を表示する */
  showClock: boolean;
  /** 次の回の開始時刻の扱い */
  nextStartMode: NextStartMode;
  /** nextStartMode==='time' のときの時刻（HH:MM） */
  nextStartTime: string;
  /** 0 より大きいとカウントダウンし、0 で自動的に次へ進む（秒） */
  autoAdvanceSec: number;
  audio: AudioSetting;
}

export type Content =
  | VideoContent
  | SlideContent
  | QuizContent
  | Interactive1Content
  | Interactive2Content
  | GameContent
  | SurveyContent
  | BranchContent
  | StandbyContent;

export interface ScenarioStep {
  id: string;
  contentId: string;
  enabled: boolean;
}

export interface Scenario {
  id: string;
  sampleId?: string;
  name: string;
  description: string;
  steps: ScenarioStep[];
}

export interface AppSettings {
  /** API キーは config.json には保存されず、safeStorage で暗号化した別ファイルに保管される */
  chatModel: string;
  embeddingModel: string;
  /** 進行画面の見出しに出す展示名 */
  exhibitTitle: string;
  /** 全画面表示にするか */
  fullscreen: boolean;
  /** 進行画面で操作ヒントを出すか */
  showHints: boolean;
  /** 外部モニターがある場合、進行画面をそちらに全画面表示する */
  preferExternalDisplay: boolean;
  /** 進行画面を外部モニターに出したとき、本体画面にコントローラを表示する */
  showController: boolean;
  /** コントローラで来場者の属性を記録するときの区分 */
  attributeOptions: string[];
  /** Marp の自作テーマ CSS（絶対パス）。`marp: true` のスライドで theme: に指定できる */
  marpThemes: string[];
}

export interface AppConfig {
  version: 1;
  /** 取り込み済みの同梱サンプルの版。上がっていれば起動時に差分を取り込む */
  samplesVersion?: number;
  settings: AppSettings;
  contents: Content[];
  scenarios: Scenario[];
  activeScenarioId: string | null;
}

/* ---------- 集計ログ ---------- */

export interface ResultRecord {
  ts: string;
  scenarioId: string | null;
  contentId: string;
  kind: 'quiz' | 'survey' | 'game' | 'attribute';
  payload: unknown;
}

/** kind==='attribute' の payload。コントローラから手入力する来場者の内訳 */
export interface AttributePayload {
  /** 区分ごとの人数 */
  counts: Record<string, number>;
  /** 合計人数 */
  people: number;
  memo: string;
}

/** 集計のリセット結果。canceled のときは何もしていない */
export interface ClearResult {
  canceled: boolean;
  cleared: number;
  /** 退避先の絶対パス（0 件のときは null） */
  backup: string | null;
}

/* ---------- ユーザーと権限 ---------- */

/**
 * 展示員ごとの役割。上から順に強い。
 * - owner:  すべての管理画面 ＋ 他のユーザーの権限変更
 * - admin:  API 以外の管理画面 ＋ 自分より下位（editor / user）の権限変更
 * - editor: シナリオとコンテンツのみ
 * - user:   既存シナリオの実行のみ（管理画面は開けない）
 */
export type Role = 'owner' | 'admin' | 'editor' | 'user';

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'オーナー',
  admin: 'アドミニストレーター',
  editor: 'エディター',
  user: 'ユーザー',
};

/** 強さの順位。数値が大きいほど強い（下位判定に使う） */
export const ROLE_RANK: Record<Role, number> = { owner: 3, admin: 2, editor: 1, user: 0 };

/** 画面に出すユーザー情報。PIN のハッシュは絶対にレンダラへ渡さない */
export interface UserInfo {
  id: string;
  name: string;
  role: Role;
}

/** ログイン状態 */
export interface AuthState {
  /** ユーザーが1人も登録されていない＝認証を使っていない（初期状態） */
  enabled: boolean;
  current: UserInfo | null;
}

/* ---------- IPC ---------- */

export interface TokenCandidate {
  token: string;
  prob: number;
  logprob: number;
}

/** main → renderer は例外を投げずにこの形で返す（ログを汚さないため） */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/* ---------- マルチモニター / コントローラ ---------- */

export interface DisplayInfo {
  id: number;
  label: string;
  width: number;
  height: number;
  isPrimary: boolean;
  /** 進行画面が今このディスプレイにあるか */
  isPlayer: boolean;
}

/** 進行画面 → コントローラ に配信する再生状態 */
export interface PlaybackState {
  scenarioName: string;
  /** 表示中のシナリオ。コントローラから切り替えられる */
  scenarioId: string;
  /** 切り替え先の候補（コントローラに一覧を出すため） */
  scenarios: Array<{ id: string; name: string }>;
  index: number;
  total: number;
  steps: Array<{ id: string; name: string; type: ContentType; note?: string }>;
  /** スライドやクイズなどコンテンツ内部の進捗（任意） */
  detail: string | null;
  /** 待機画面を重ねて表示しているか */
  standby: boolean;
  /** 待機画面のBGMの状態（コントローラから操作するため） */
  standbyAudio: { available: boolean; muted: boolean };
  /** いま効いている待機画面の「次の回のはじまり」（コントローラから編集するため） */
  standbyNext: { contentId: string; mode: NextStartMode; time: string };
  /**
   * 分岐画面から体験へ飛んでいるとき、次へ進むと帰る先のステップ番号。
   * 進行係が「なぜ戻ったのか」を分かるように出す。飛んでいなければ null
   */
  returnTo: number | null;
}

export type PlaybackCommand =
  | { type: 'next' }
  | { type: 'prev' }
  /** コンテンツ内部の送り／戻し（スライドのページ送りなど）。末尾なら次のコンテンツへ */
  | { type: 'advance' }
  | { type: 'back' }
  | { type: 'goto'; index: number }
  /** 別のシナリオへ移る（待機画面から本編に入るときなど） */
  | { type: 'scenario'; id: string }
  | { type: 'restart' }
  /** 待機画面のオン/オフ（省略時はトグル） */
  | { type: 'standby'; on?: boolean }
  /** 待機画面のBGMのミュート切替（省略時はトグル） */
  | { type: 'standbyMute'; muted?: boolean };
