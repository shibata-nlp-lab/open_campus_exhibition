import { describe, expect, it } from 'vitest';
import type { AppConfig, Content, ContentType } from '../src/types';
import { CONTENT_LABELS, SAMPLES_VERSION, createContent, createDefaultConfig, mergeSamples } from '../src/defaults';

const TYPES: ContentType[] = [
  'video',
  'slide',
  'quiz',
  'interactive1',
  'interactive2',
  'game',
  'survey',
  'standby',
];

describe('createContent', () => {
  it.each(TYPES)('%s の空テンプレートを作れる', (type) => {
    const c = createContent(type);
    expect(c.type).toBe(type);
    expect(c.id).toBeTruthy();
    expect(c.name).toBe(CONTENT_LABELS[type]);
  });

  it('id は毎回違う', () => {
    expect(createContent('quiz').id).not.toBe(createContent('quiz').id);
  });
});

describe('CONTENT_LABELS', () => {
  it('全種別に日本語名がある', () => {
    for (const t of TYPES) expect(CONTENT_LABELS[t]).toBeTruthy();
  });
});

describe('createDefaultConfig — 同梱教材の整合性', () => {
  const cfg = createDefaultConfig();
  const ids = new Set(cfg.contents.map((c) => c.id));

  it('シナリオのステップが実在するコンテンツを指している', () => {
    for (const s of cfg.scenarios) {
      for (const st of s.steps) {
        expect(ids.has(st.contentId), `${s.name} の ${st.contentId} が見つからない`).toBe(true);
      }
    }
  });

  it('activeScenarioId が実在する', () => {
    expect(cfg.scenarios.map((s) => s.id)).toContain(cfg.activeScenarioId);
  });

  it('コンテンツ id が重複していない', () => {
    expect(ids.size).toBe(cfg.contents.length);
  });

  it('sampleId が重複していない（重複取り込みの判定に使うため）', () => {
    const sampleIds = cfg.contents.map((c) => c.sampleId).filter(Boolean);
    expect(new Set(sampleIds).size).toBe(sampleIds.length);
  });

  it('全コンテンツが既知の種別', () => {
    for (const c of cfg.contents) expect(TYPES).toContain(c.type);
  });

  it('シナリオが 1 本以上あり、空のシナリオが無い', () => {
    expect(cfg.scenarios.length).toBeGreaterThan(0);
    for (const s of cfg.scenarios) expect(s.steps.length).toBeGreaterThan(0);
  });

  it('samplesVersion が最新で作られる', () => {
    expect(cfg.samplesVersion).toBe(SAMPLES_VERSION);
  });
});

describe('mergeSamples', () => {
  const userConfig = (): AppConfig => ({
    ...createDefaultConfig(),
    contents: [{ ...createContent('quiz'), id: 'mine', name: '自作クイズ' } as Content],
    scenarios: [{ id: 'sc-mine', name: '自作シナリオ', description: '', steps: [{ id: 'st', contentId: 'mine', enabled: true }] }],
    samplesVersion: 0,
  });

  it('自作のコンテンツとシナリオを消さない', () => {
    const cfg = userConfig();
    mergeSamples(cfg);
    expect(cfg.contents.find((c) => c.id === 'mine')).toBeDefined();
    expect(cfg.scenarios.find((s) => s.id === 'sc-mine')).toBeDefined();
  });

  it('教材を追加する', () => {
    const cfg = userConfig();
    const added = mergeSamples(cfg);
    expect(added.addedContents).toBeGreaterThan(0);
    expect(added.addedScenarios).toBeGreaterThan(0);
  });

  it('2回流しても増えない（sampleId で重複を弾く）', () => {
    const cfg = userConfig();
    mergeSamples(cfg);
    expect(mergeSamples(cfg)).toEqual({ addedContents: 0, addedScenarios: 0 });
  });

  it('中身が空の動画プレースホルダは足さない', () => {
    const cfg = userConfig();
    mergeSamples(cfg);
    expect(cfg.contents.some((c) => c.sampleId === 'video-opening')).toBe(false);
  });

  it('追加したシナリオのステップが、すべて実在するコンテンツを指す', () => {
    const cfg = userConfig();
    mergeSamples(cfg);
    const ids = new Set(cfg.contents.map((c) => c.id));
    for (const s of cfg.scenarios) {
      for (const st of s.steps) expect(ids.has(st.contentId)).toBe(true);
    }
  });

  it('samplesVersion を最新にする', () => {
    const cfg = userConfig();
    mergeSamples(cfg);
    expect(cfg.samplesVersion).toBe(SAMPLES_VERSION);
  });
});
