import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  AppConfig,
  Interactive1Content,
  Interactive2Content,
  SlideContent,
  StandbyContent,
} from '../src/types';
import { DEFAULT_ATTRIBUTE_OPTIONS, SAMPLES_VERSION } from '../src/defaults';

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

  it('体験②の画面ごとの音声を、2画面ぶん空で用意する', () => {
    const cfg = migrate(base({ contents: [{ id: 'c1', type: 'interactive2', name: '体験' } as never] }));
    expect(Object.keys((cfg.contents[0] as Interactive2Content).screenAudio).sort()).toEqual(['input', 'predict']);
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
