import type {
  AppConfig,
  AudioSetting,
  Content,
  ContentType,
  GameContent,
  Interactive1Content,
  Interactive2Content,
  QuizContent,
  Scenario,
  SlideContent,
  StandbyContent,
  SurveyContent,
  VideoContent,
} from './types';
import {
  GAME_ROUNDS,
  QUIZ_ADVANCED,
  QUIZ_BASIC,
  SLIDE_ATTENTION,
  SLIDE_FUTURE,
  SLIDE_INTRO,
  SLIDE_LIMITS,
  SLIDE_PROBABILITY,
  SLIDE_TOKENIZE,
  SLIDE_TRAINING,
  type SampleQuestion,
  type SampleRound,
} from './content/samples';

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const emptyAudio = (): AudioSetting => ({ src: null, volume: 0.6, loop: false });

/** コントローラで来場者の内訳を記録するときの既定の区分 */
export const DEFAULT_ATTRIBUTE_OPTIONS = [
  '高校1年',
  '高校2年',
  '高校3年',
  '中学生',
  '保護者',
  '先生',
  'その他',
];

export const CONTENT_LABELS: Record<ContentType, string> = {
  video: '動画',
  slide: 'スライド',
  quiz: 'クイズ',
  interactive1: 'インタラクティブ1（単語分割）',
  interactive2: 'インタラクティブ2（次単語予測）',
  game: 'ゲーム（次の単語当て）',
  survey: 'アンケート',
  standby: '待機画面',
};

/** 各コンテンツ種別の空テンプレート */
export function createContent(type: ContentType): Content {
  const base = { id: uid(type), name: CONTENT_LABELS[type], note: '' };
  switch (type) {
    case 'video':
      return { ...base, type, src: null, muted: false, loop: false, autoAdvance: true } as VideoContent;
    case 'slide':
      return {
        ...base,
        type,
        format: 'markdown',
        src: null,
        markdownSource: 'inline',
        inlineText: '',
        externalPath: null,
        audio: emptyAudio(),
        autoAdvanceSec: 0,
      } as SlideContent;
    case 'quiz':
      return {
        ...base,
        type,
        questions: [
          {
            id: uid('q'),
            text: '新しい問題',
            choices: [
              { id: uid('c'), text: '選択肢A' },
              { id: uid('c'), text: '選択肢B' },
            ],
            answerIndex: 0,
            explanation: '',
            imageSrc: null,
          },
        ],
        timeLimitSec: 20,
        showExplanation: true,
        audio: emptyAudio(),
      } as QuizContent;
    case 'interactive1':
      return {
        ...base,
        type,
        prompt: '好きな文を入力してみよう',
        placeholder: '例）今日はオープンキャンパスに来ました',
        examples: ['今日はオープンキャンパスに来ました', '大規模言語モデルは言葉を数字に変換する'],
        neighbourSource: 'curated',
        tokenizerMode: 'gpt',
        embeddingSource: 'openai',
        ruriSize: '130m',
        llmjpSize: '150m',
        similarityDisplay: 'relative',
        showTokenId: true,
      } as Interactive1Content;
    case 'interactive2':
      return {
        ...base,
        type,
        prompt: '文の続きをAIに予測させてみよう',
        placeholder: '例）今日の天気は',
        examples: ['今日の天気は', '吾輩は猫で', '日本の首都は'],
        topK: 5,
        maxSteps: 12,
        autoPickTop: false,
      } as Interactive2Content;
    case 'game':
      return {
        ...base,
        type,
        rounds: [
          {
            id: uid('r'),
            context: '朝ごはんにパンを',
            choices: [
              { text: '食べた', prob: 0.72 },
              { text: '走った', prob: 0.02 },
              { text: '焼いた', prob: 0.18 },
              { text: '泳いだ', prob: 0.01 },
            ],
            answerIndex: 0,
            explanation: 'LLMは「パンを」の次に来やすい語を確率で選びます。',
          },
        ],
        timeLimitSec: 15,
        pointsPerCorrect: 100,
      } as GameContent;
    case 'survey':
      return {
        ...base,
        type,
        questions: [
          {
            id: uid('sq'),
            text: '展示は分かりやすかったですか？',
            kind: 'scale',
            choices: [],
          },
        ],
        defaultPeople: 1,
        audio: emptyAudio(),
      } as SurveyContent;
    case 'standby':
      return {
        ...base,
        type,
        message: 'しばらくお待ちください',
        submessage: 'まもなく次の説明がはじまります',
        showClock: true,
        nextStartMode: 'hidden',
        nextStartTime: '',
        autoAdvanceSec: 0,
        audio: emptyAudio(),
      } as StandbyContent;
  }
}

/* ---------------- 初回起動時に入っているサンプル一式 ---------------- */

/**
 * 同梱サンプルの版。教材を更新したらこの数値を上げると、
 * 既存の config.json にも起動時に差分が取り込まれる。
 */
export const SAMPLES_VERSION = 2;

function slide(sampleId: string, name: string, text: string, note = ''): SlideContent {
  return { ...(createContent('slide') as SlideContent), sampleId, name, note, inlineText: text };
}

function quiz(sampleId: string, name: string, questions: SampleQuestion[], timeLimitSec: number): QuizContent {
  return {
    ...(createContent('quiz') as QuizContent),
    sampleId,
    name,
    timeLimitSec,
    questions: questions.map((q) => ({
      id: uid('q'),
      text: q.text,
      choices: q.choices.map((text) => ({ id: uid('c'), text })),
      answerIndex: q.answerIndex,
      explanation: q.explanation,
      imageSrc: null,
    })),
  };
}

function game(sampleId: string, name: string, rounds: SampleRound[]): GameContent {
  return {
    ...(createContent('game') as GameContent),
    sampleId,
    name,
    rounds: rounds.map((r) => ({ id: uid('r'), ...r })),
    timeLimitSec: 15,
    pointsPerCorrect: 100,
  };
}

export function createDefaultConfig(): AppConfig {
  /* --- スライド（説明パート） --- */
  const sIntro = slide('slide-intro', '①イントロ：AIはどうやって文章を作る？', SLIDE_INTRO, 'つかみ。3分程度');
  const sToken = slide('slide-tokenize', '②ことばを数字にする', SLIDE_TOKENIZE, '体験①の前ふり');
  const sAttention = slide('slide-attention', '③文脈を読む仕組み（アテンション）', SLIDE_ATTENTION);
  const sProb = slide('slide-probability', '④次の1語を選ぶ（確率と温度）', SLIDE_PROBABILITY, 'ゲームの前ふり');
  const sTraining = slide('slide-training', '⑤学習ってなにをしているの？', SLIDE_TRAINING);
  const sLimits = slide('slide-limits', '⑥AIが苦手なこと（ハルシネーション）', SLIDE_LIMITS);
  const sFuture = slide('slide-future', '⑦これからどう付き合う？', SLIDE_FUTURE, 'しめくくり');

  /* --- 体験 --- */
  const i1 = createContent('interactive1') as Interactive1Content;
  i1.name = '体験①：ことばを数字にする';
  i1.sampleId = 'interactive1';

  const i2 = createContent('interactive2') as Interactive2Content;
  i2.name = '体験②：次の単語を予測する';
  i2.sampleId = 'interactive2';

  /* --- ゲーム・クイズ・アンケート --- */
  const gMain = game('game-main', '次の単語当てゲーム', GAME_ROUNDS);
  const qBasic = quiz('quiz-basic', 'ふりかえりクイズ（基礎）', QUIZ_BASIC, 20);
  const qAdvanced = quiz('quiz-advanced', 'ふりかえりクイズ（発展）', QUIZ_ADVANCED, 25);

  const survey: SurveyContent = {
    ...(createContent('survey') as SurveyContent),
    sampleId: 'survey-main',
    name: '展示アンケート',
    questions: [
      { id: uid('sq'), text: '展示は分かりやすかったですか？', kind: 'scale', choices: [] },
      {
        id: uid('sq'),
        text: '一番おもしろかったのは？',
        kind: 'choice',
        choices: ['トークナイズ体験', '次単語予測', '次の単語当てゲーム', 'クイズ', 'スライドの説明'],
      },
      {
        id: uid('sq'),
        text: '情報系の学部に興味を持ちましたか？',
        kind: 'choice',
        choices: ['とても興味を持った', '少し興味を持った', 'もともと興味があった', 'あまり…'],
      },
    ],
    defaultPeople: 1,
  };

  /* --- 待機画面・動画 --- */
  const standby: StandbyContent = {
    ...(createContent('standby') as StandbyContent),
    sampleId: 'standby-main',
    name: '待機画面（説明の合間）',
    note: '次のグループを待つときに使います',
  };

  const video = createContent('video') as VideoContent;
  video.name = 'オープニング動画（未設定）';
  video.sampleId = 'video-opening';

  const contents: Content[] = [
    video,
    standby,
    sIntro,
    sToken,
    i1,
    sAttention,
    sProb,
    i2,
    gMain,
    sTraining,
    sLimits,
    qBasic,
    qAdvanced,
    sFuture,
    survey,
  ];

  /* --- シナリオ --- */
  const fullOrder = [
    sIntro, sToken, i1, sAttention, sProb, i2, gMain, sTraining, sLimits, qBasic, qAdvanced, sFuture, survey,
  ];
  const shortOrder = [sIntro, sToken, i1, sProb, i2, gMain, qBasic, survey];

  const full: Scenario = {
    id: uid('sc'),
    sampleId: 'scenario-full',
    name: 'フル版（約25分）',
    description: 'しくみの説明を一通り。体験②→ゲーム→クイズ発展まで',
    steps: fullOrder.map((c) => ({ id: uid('st'), contentId: c.id, enabled: true })),
  };
  const short: Scenario = {
    id: uid('sc'),
    sampleId: 'scenario-short',
    name: 'ショート版（約12分）',
    description: '来場者の回転が速いとき用。体験とゲームを中心に',
    steps: shortOrder.map((c) => ({ id: uid('st'), contentId: c.id, enabled: true })),
  };

  return {
    version: 1,
    samplesVersion: SAMPLES_VERSION,
    settings: {
      chatModel: 'gpt-4.1-mini',
      embeddingModel: 'text-embedding-3-small',
      exhibitTitle: 'LLMのしくみ体験コーナー',
      fullscreen: true,
      showHints: true,
      preferExternalDisplay: true,
      showController: true,
      attributeOptions: DEFAULT_ATTRIBUTE_OPTIONS.slice(),
    },
    contents,
    scenarios: [full, short],
    activeScenarioId: full.id,
  };
}

/** スライドが空のときに表示するプレースホルダ */
export const DEFAULT_INTRO_MARKDOWN = `# スライドが未設定です

設定画面の「コンテンツ」タブで内容を入力してください。
`;

/**
 * 同梱サンプルのうち、まだ config に無いものを追加する（非破壊）。
 * sampleId で照合するので、何度呼んでも重複しない。
 * ユーザーが編集・削除したものは sampleId が残っている限り再追加されない。
 */
export function mergeSamples(config: AppConfig): { addedContents: number; addedScenarios: number } {
  const sample = createDefaultConfig();
  const haveContent = new Set(config.contents.map((c) => c.sampleId).filter(Boolean) as string[]);
  const haveScenario = new Set(config.scenarios.map((s) => s.sampleId).filter(Boolean) as string[]);

  // 動画（中身が空のプレースホルダ）は既存環境に増やしても邪魔なので除く
  const newContents = sample.contents.filter(
    (c) => c.sampleId && c.sampleId !== 'video-opening' && !haveContent.has(c.sampleId)
  );
  config.contents.push(...newContents);

  // 追加したコンテンツを参照しているシナリオだけ、参照切れを除いたうえで追加する
  const availableIds = new Set(config.contents.map((c) => c.id));
  const newScenarios = sample.scenarios
    .filter((s) => s.sampleId && !haveScenario.has(s.sampleId))
    .map((s) => ({ ...s, steps: s.steps.filter((st) => availableIds.has(st.contentId)) }))
    .filter((s) => s.steps.length > 0);
  config.scenarios.push(...newScenarios);

  config.samplesVersion = SAMPLES_VERSION;
  return { addedContents: newContents.length, addedScenarios: newScenarios.length };
}
