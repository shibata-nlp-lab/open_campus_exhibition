import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  AppConfig,
  BranchContent,
  Interactive1Content,
  Interactive2Content,
  SlideContent,
  StandbyContent,
} from '../src/types';
import { DEFAULT_ATTRIBUTE_OPTIONS, DEFAULT_AUTO_SEC, SAMPLES_VERSION } from '../src/defaults';

// config.ts は app.getPath('userData') を使うので、一時ディレクトリに差し替える
const tmp = path.join(os.tmpdir(), 'oc-test-' + Math.random().toString(36).slice(2));
vi.mock('electron', () => ({ app: { getPath: () => tmp } }));

const { migrate } = await import('../electron/config');

beforeAll(() => {
  fs.mkdirSync(tmp, { recursive: true });
});

/** 現行スキーマの最小構成。samplesVersion は最新にして教材の取り込みを起こさせない */
const base = (over: Partial<AppConfig> = {}): AppConfig =>
  ({
    version: 1,
    samplesVersion: SAMPLES_VERSION,
    settings: {
      chatModel: 'gpt-4o-mini',
      embeddingModel: 'text-embedding-3-small',
      exhibitTitle: '展示',
      fullscreen: true,
      showHints: true,
      preferExternalDisplay: true,
      showController: true,
      attributeOptions: ['高校1年'],
    },
    contents: [],
    scenarios: [],
    activeScenarioId: null,
    ...over,
  }) as AppConfig;

describe('migrate — 廃止された種別の掃除', () => {
  it('未知の type のコンテンツを消す', () => {
    const cfg = migrate(base({ contents: [{ id: 'c1', type: 'certificate', name: '来場証明書' } as never] }));
    expect(cfg.contents).toHaveLength(0);
  });

  it('消したコンテンツを参照しているシナリオのステップも消す（宙に浮いた参照を残さない）', () => {
    const cfg = migrate(
      base({
        contents: [{ id: 'c1', type: 'certificate', name: '証明書' } as never],
        scenarios: [
          {
            id: 's1',
            name: 'シナリオ',
            description: '',
            steps: [
              { id: 'st1', contentId: 'c1', enabled: true },
              { id: 'st2', contentId: 'c2', enabled: true },
            ],
          },
        ],
      })
    );
    expect(cfg.scenarios[0].steps.map((s) => s.contentId)).toEqual(['c2']);
  });

  it('既知の type は残す', () => {
    const cfg = migrate(base({ contents: [{ id: 'c1', type: 'quiz', name: 'クイズ', questions: [] } as never] }));
    expect(cfg.contents).toHaveLength(1);
  });

  it('分岐（体験に戻る）を消さない — known に入れ忘れると次の起動で消える', () => {
    const cfg = migrate(base({ contents: [{ id: 'c1', type: 'branch', name: '体験に戻る' } as never] }));
    expect(cfg.contents).toHaveLength(1);
  });
});

describe('migrate — 新しく増えたフィールドの補完', () => {
  it('interactive1 に既定値を入れる', () => {
    const cfg = migrate(base({ contents: [{ id: 'c1', type: 'interactive1', name: '体験' } as never] }));
    const c = cfg.contents[0] as Interactive1Content;
    expect(c.neighbourSource).toBe('curated');
    expect(c.tokenizerMode).toBe('gpt');
    expect(c.embeddingSource).toBe('openai');
    expect(c.ruriSize).toBe('130m');
  });

  it('すでに値があれば上書きしない', () => {
    const cfg = migrate(
      base({ contents: [{ id: 'c1', type: 'interactive1', name: '体験', tokenizerMode: 'ruri' } as never] })
    );
    expect((cfg.contents[0] as Interactive1Content).tokenizerMode).toBe('ruri');
  });

  it('体験①の画面ごとの音声を、3画面ぶん空で用意する', () => {
    const cfg = migrate(base({ contents: [{ id: 'c1', type: 'interactive1', name: '体験' } as never] }));
    const a = (cfg.contents[0] as Interactive1Content).screenAudio;
    expect(Object.keys(a).sort()).toEqual(['input', 'tokens', 'vectors']);
    for (const s of Object.values(a)) expect(s.src).toBeNull();
  });

  it('体験②の画面ごとの音声を、3画面ぶん空で用意する', () => {
    const cfg = migrate(base({ contents: [{ id: 'c1', type: 'interactive2', name: '体験' } as never] }));
    expect(Object.keys((cfg.contents[0] as Interactive2Content).screenAudio).sort()).toEqual([
      'input',
      'pick',
      'predict',
    ]);
  });

  it('自動モードの待ち時間を、コンテンツと画面それぞれに入れる', () => {
    const cfg = migrate(
      base({
        contents: [
          { id: 'c1', type: 'slide', name: 'スライド' } as never,
          { id: 'c2', type: 'interactive1', name: '体験①' } as never,
          { id: 'c3', type: 'interactive2', name: '体験②' } as never,
        ],
      })
    );
    expect(cfg.contents[0].autoSec).toBe(DEFAULT_AUTO_SEC);
    expect((cfg.contents[1] as Interactive1Content).screenAutoSec.vectors).toBe(DEFAULT_AUTO_SEC);
    expect((cfg.contents[2] as Interactive2Content).screenAutoSec.pick).toBe(DEFAULT_AUTO_SEC);
  });

  it('自分で入れた待ち時間は残す。0 秒（音声の直後に進む）も潰さない', () => {
    const cfg = migrate(
      base({
        contents: [
          { id: 'c1', type: 'slide', name: 'スライド', autoSec: 0 } as never,
          { id: 'c2', type: 'interactive1', name: '体験①', screenAutoSec: { tokens: 12 } } as never,
        ],
      })
    );
    expect(cfg.contents[0].autoSec).toBe(0);
    const sec = (cfg.contents[1] as Interactive1Content).screenAutoSec;
    expect(sec.tokens).toBe(12);
    expect(sec.input).toBe(DEFAULT_AUTO_SEC);
  });

  it('体験②の予測の取得元は、既存の設定では OpenAI のまま（勝手にローカルへ切り替えない）', () => {
    const cfg = migrate(base({ contents: [{ id: 'c1', type: 'interactive2', name: '体験' } as never] }));
    expect((cfg.contents[0] as Interactive2Content).predictSource).toBe('openai');
    // モデルを空のままにすると、選択肢の無い select になって直せなくなる
    expect((cfg.contents[0] as Interactive2Content).predictModelId).toBe('150m');
  });

  it('v0.3.0 の llmjpNextSize / predictSource:llmjp を読み替える', () => {
    const cfg = migrate(
      base({
        contents: [
          { id: 'c1', type: 'interactive2', name: '体験', predictSource: 'llmjp', llmjpNextSize: '980m' } as never,
        ],
      })
    );
    const c = cfg.contents[0] as Interactive2Content;
    expect(c.predictSource).toBe('local');
    expect(c.predictModelId).toBe('980m');
    // 旧フィールドは残さない（両方見て食い違うのを防ぐ）
    expect('llmjpNextSize' in c).toBe(false);
  });

  it('体験②でローカルモデルを選んでいれば、そのまま残す', () => {
    const cfg = migrate(
      base({ contents: [{ id: 'c1', type: 'interactive2', name: '体験', predictSource: 'local' } as never] })
    );
    expect((cfg.contents[0] as Interactive2Content).predictSource).toBe('local');
  });

  it('設定済みの画面の音声は残したまま、足りない画面だけ足す', () => {
    // 途中のバージョンで一部の画面にだけ音を入れた config を想定
    const cfg = migrate(
      base({
        contents: [
          {
            id: 'c1',
            type: 'interactive1',
            name: '体験',
            screenAudio: { tokens: { src: 'a.mp3', volume: 0.3, loop: true } },
          } as never,
        ],
      })
    );
    const a = (cfg.contents[0] as Interactive1Content).screenAudio;
    expect(a.tokens).toEqual({ src: 'a.mp3', volume: 0.3, loop: true });
    expect(a.input.src).toBeNull();
    expect(a.vectors.src).toBeNull();
  });

  it('分岐の戻り先が1つだけだった旧形式を、1件の targets に畳む', () => {
    const cfg = migrate(
      base({
        contents: [
          {
            id: 'c1',
            type: 'branch',
            name: '体験に戻る',
            targetContentId: 'exp1',
            goLabel: '体験する ▶',
          } as never,
        ],
      })
    );
    const c = cfg.contents[0] as BranchContent;
    expect(c.targets).toHaveLength(1);
    expect(c.targets[0].contentId).toBe('exp1');
    expect(c.targets[0].label).toBe('体験する ▶');
    expect(c.targets[0].id).toBeTruthy();
    // 旧フィールドは残さない（両方見て食い違うのを防ぐ）
    expect('targetContentId' in c).toBe(false);
    expect('goLabel' in c).toBe(false);
  });

  it('旧形式で戻り先が未設定なら、空の targets にする', () => {
    const cfg = migrate(
      base({ contents: [{ id: 'c1', type: 'branch', name: '体験に戻る', targetContentId: null } as never] })
    );
    expect((cfg.contents[0] as BranchContent).targets).toEqual([]);
  });

  it('すでに targets があれば触らない', () => {
    const targets = [{ id: 'bt1', contentId: 'exp1', label: '' }];
    const cfg = migrate(base({ contents: [{ id: 'c1', type: 'branch', name: '分岐', targets } as never] }));
    expect((cfg.contents[0] as BranchContent).targets).toEqual(targets);
  });

  it('standby の開始時刻まわりに既定値を入れる', () => {
    const cfg = migrate(base({ contents: [{ id: 'c1', type: 'standby', name: '待機' } as never] }));
    const c = cfg.contents[0] as StandbyContent;
    expect(c.nextStartMode).toBe('hidden');
    expect(c.nextStartTime).toBe('');
  });

  it('slide の取得元に既定値を入れる', () => {
    const cfg = migrate(base({ contents: [{ id: 'c1', type: 'slide', name: 'スライド' } as never] }));
    const c = cfg.contents[0] as SlideContent;
    expect(c.markdownSource).toBe('inline');
    expect(c.externalPath).toBeNull();
    expect(c.inlineText).toBe('');
  });

  it('本文を assets に置いていた旧形式は、読めなくても壊れない', () => {
    // 参照先の .md が既に無いケース。本文は空になり、src は外れる
    const cfg = migrate(
      base({
        contents: [
          { id: 'c1', type: 'slide', name: 'スライド', format: 'markdown', markdownSource: 'inline', src: 'nope.md' } as never,
        ],
      })
    );
    const c = cfg.contents[0] as SlideContent;
    expect(c.inlineText).toBe('');
    expect(c.src).toBeNull();
  });

  it('マルチモニターの設定が無ければ true にする', () => {
    const cfg = base();
    delete (cfg.settings as Partial<AppConfig['settings']>).preferExternalDisplay;
    delete (cfg.settings as Partial<AppConfig['settings']>).showController;
    const out = migrate(cfg);
    expect(out.settings.preferExternalDisplay).toBe(true);
    expect(out.settings.showController).toBe(true);
  });

  it('属性の区分が無い・空なら既定の一覧を入れる', () => {
    const missing = base();
    delete (missing.settings as Partial<AppConfig['settings']>).attributeOptions;
    expect(migrate(missing).settings.attributeOptions).toEqual(DEFAULT_ATTRIBUTE_OPTIONS);

    expect(migrate(base({ settings: { ...base().settings, attributeOptions: [] } })).settings.attributeOptions).toEqual(
      DEFAULT_ATTRIBUTE_OPTIONS
    );
  });

  it('自分で決めた区分は残す', () => {
    const cfg = migrate(base({ settings: { ...base().settings, attributeOptions: ['引率の先生'] } }));
    expect(cfg.settings.attributeOptions).toEqual(['引率の先生']);
  });
});

describe('migrate — 冪等性', () => {
  it('2回流しても結果が変わらない（起動のたびに書き換わり続けない）', () => {
    const src = () =>
      base({
        contents: [
          { id: 'c1', type: 'interactive1', name: '体験' } as never,
          { id: 'c2', type: 'standby', name: '待機' } as never,
        ],
        scenarios: [
          { id: 's1', name: 'シナリオ', description: '', steps: [{ id: 'st1', contentId: 'c1', enabled: true }] },
        ],
      });
    const once = migrate(src());
    const twice = migrate(migrate(src()));
    expect(twice).toEqual(once);
  });
});

describe('migrate — 教材の取り込み', () => {
  it('自作コンテンツがある config には教材を足すだけで、既存を消さない', () => {
    const mine = { id: 'mine', type: 'quiz', name: '自作クイズ', questions: [{}, {}, {}] } as never;
    const cfg = migrate(base({ samplesVersion: 0, contents: [mine] }));
    expect(cfg.contents.find((c) => c.id === 'mine')).toBeDefined();
    expect(cfg.contents.length).toBeGreaterThan(1);
    expect(cfg.samplesVersion).toBe(SAMPLES_VERSION);
  });

  it('取り込み後は samplesVersion が上がり、次回は何も起きない', () => {
    const cfg = migrate(base({ samplesVersion: 0, contents: [{ id: 'mine', type: 'quiz', name: '自作', questions: [{}, {}, {}] } as never] }));
    const count = cfg.contents.length;
    expect(migrate(cfg).contents).toHaveLength(count);
  });
});

describe('migrate — 文言の言い換え', () => {
  it('手を入れていない初期の問いかけだけ差し替える', () => {
    const cfg = migrate(
      base({
        contents: [
          { id: 'c1', type: 'interactive1', name: '体験', prompt: '好きな文章を入力してみよう' } as never,
          { id: 'c2', type: 'interactive1', name: '体験2', prompt: '自分で書いた問いかけ' } as never,
        ],
      })
    );
    expect((cfg.contents[0] as Interactive1Content).prompt).toBe('好きな文を入力してみよう');
    expect((cfg.contents[1] as Interactive1Content).prompt).toBe('自分で書いた問いかけ');
  });
});
