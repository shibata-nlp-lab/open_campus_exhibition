import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig, ResultRecord } from '../src/types';
import { createDefaultConfig, DEFAULT_ATTRIBUTE_OPTIONS, mergeSamples, SAMPLES_VERSION } from '../src/defaults';

export const userDir = () => app.getPath('userData');
export const assetsDir = () => path.join(userDir(), 'assets');
export const configPath = () => path.join(userDir(), 'config.json');
export const resultsPath = () => path.join(userDir(), 'results.jsonl');

export const cacheDir = () => path.join(userDir(), 'cache');

export function ensureDirs() {
  fs.mkdirSync(assetsDir(), { recursive: true });
  fs.mkdirSync(cacheDir(), { recursive: true });
}

/** 埋め込みなど再取得の高い結果を userData/cache に置く */
export function readCache(key: string): string | null {
  try {
    return fs.readFileSync(path.join(cacheDir(), `${sanitizeKey(key)}.json`), 'utf-8');
  } catch {
    return null;
  }
}

export function writeCache(key: string, text: string) {
  ensureDirs();
  fs.writeFileSync(path.join(cacheDir(), `${sanitizeKey(key)}.json`), text, 'utf-8');
}

const sanitizeKey = (key: string) => key.replace(/[^\w.-]/g, '_').slice(0, 120);

/** v1 時代の初期サンプルの名前。これしか入っていなければユーザーの作業はないとみなす */
const V1_SAMPLE_CONTENT_NAMES = new Set([
  'オープニング動画（未設定）',
  'イントロ：LLMってなに？',
  '体験①：ことばを数字にする',
  '体験②：次の単語を予測する',
  '次の単語当てゲーム',
  'ふりかえりクイズ',
  '展示アンケート',
  '来場証明書の発行',
]);
const V1_SAMPLE_SCENARIO_NAMES = new Set(['標準シナリオ（約15分）']);

/**
 * 「初期サンプルのまま何も編集していない」config かどうか。
 * 1つでも見覚えのない名前があれば false（ユーザーの作業を消さないため）。
 */
function isUntouchedV1Samples(config: AppConfig): boolean {
  if (config.contents.some((c) => c.sampleId)) return false;
  if (!config.contents.every((c) => V1_SAMPLE_CONTENT_NAMES.has(c.name))) return false;
  if (!config.scenarios.every((s) => V1_SAMPLE_SCENARIO_NAMES.has(s.name))) return false;
  // 中身を編集していないか（スライド本文・問題数）をざっと確認
  return config.contents.every((c) => {
    if (c.type === 'slide') return !c.inlineText?.trim() && !c.externalPath;
    if (c.type === 'quiz') return c.questions.length <= 2;
    if (c.type === 'game') return c.rounds.length <= 3;
    return true;
  });
}

/** 旧バージョンの config を現行スキーマに合わせる（証明書の削除・新規フィールドの補完） */
export function migrate(config: AppConfig): AppConfig {
  const known = new Set([
    'video',
    'slide',
    'quiz',
    'interactive1',
    'interactive2',
    'game',
    'survey',
    'standby',
  ]);
  const removed = config.contents.filter((c) => !known.has(c.type)).map((c) => c.id);
  if (removed.length) {
    config.contents = config.contents.filter((c) => known.has(c.type));
    for (const s of config.scenarios) s.steps = s.steps.filter((st) => !removed.includes(st.contentId));
  }
  for (const c of config.contents) {
    if (c.type === 'interactive1') {
      c.neighbourSource ??= 'curated';
      c.tokenizerMode ??= 'gpt';
      c.embeddingSource ??= 'openai';
      c.ruriSize ??= '130m';
      c.llmjpSize ??= '150m';
      c.similarityDisplay ??= 'relative';
      c.showTokenId ??= true;
      // 初期文言の言い換え。手を入れていないものだけ差し替える
      if (c.prompt === '好きな文章を入力してみよう') c.prompt = '好きな文を入力してみよう';
    }
    if (c.type === 'standby') {
      c.nextStartMode ??= 'hidden';
      c.nextStartTime ??= '';
    }
    if (c.type === 'slide') {
      c.markdownSource ??= 'inline';
      c.externalPath ??= null;
      // 旧形式：本文を assets の .md に置いていたものを config.json 内へ取り込む
      if (c.inlineText === undefined) {
        c.inlineText = '';
        if (c.format === 'markdown' && c.markdownSource === 'inline' && c.src) {
          try {
            c.inlineText = fs.readFileSync(assetAbsolutePath(c.src), 'utf-8');
          } catch {
            /* 読めなければ空のまま */
          }
          c.src = null;
        }
      }
    }
  }
  config.settings.preferExternalDisplay ??= true;
  config.settings.showController ??= true;
  if (!Array.isArray(config.settings.attributeOptions) || config.settings.attributeOptions.length === 0) {
    config.settings.attributeOptions = DEFAULT_ATTRIBUTE_OPTIONS.slice();
  }
  if (!Array.isArray(config.settings.marpThemes)) config.settings.marpThemes = [];

  // 同梱サンプルが更新されていたら取り込む
  if ((config.samplesVersion ?? 0) < SAMPLES_VERSION) {
    if (isUntouchedV1Samples(config)) {
      // 旧サンプルしか入っていない（＝ユーザーの作業がない）なら、重複を避けて丸ごと入れ替える
      const fresh = createDefaultConfig();
      config.contents = fresh.contents;
      config.scenarios = fresh.scenarios;
      config.activeScenarioId = fresh.activeScenarioId;
      config.samplesVersion = SAMPLES_VERSION;
      console.log('[config] 旧サンプルのみだったため、教材一式を新しいものに入れ替えました');
      return config;
    }
  }
  if ((config.samplesVersion ?? 0) < SAMPLES_VERSION) {
    const added = mergeSamples(config);
    if (added.addedContents || added.addedScenarios) {
      console.log(
        `[config] サンプル教材を取り込みました: コンテンツ ${added.addedContents} 件 / シナリオ ${added.addedScenarios} 件`
      );
    }
  }
  return config;
}

export function loadConfig(): AppConfig {
  ensureDirs();
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    const parsed = JSON.parse(raw) as AppConfig;
    if (!parsed.settings || !Array.isArray(parsed.contents)) throw new Error('invalid config');
    const migrated = migrate(parsed);
    // 変換が発生していたらその場で書き戻す（次回以降の読み込みを安定させる）
    const after = JSON.stringify(migrated, null, 2);
    if (after !== raw) fs.writeFileSync(configPath(), after, 'utf-8');
    return migrated;
  } catch {
    const fresh = createDefaultConfig();
    saveConfig(fresh);
    return fresh;
  }
}

export function saveConfig(config: AppConfig) {
  ensureDirs();
  const tmp = configPath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmp, configPath());
}

/** 取り込んだファイルを userData/assets にコピーして相対パスを返す */
export function importAsset(sourcePath: string): string {
  ensureDirs();
  const ext = path.extname(sourcePath);
  const base = path
    .basename(sourcePath, ext)
    .replace(/[^\w\-.ぁ-んァ-ヶ一-龠]/g, '_')
    .slice(0, 40);
  const name = `${Date.now().toString(36)}_${base}${ext}`;
  fs.copyFileSync(sourcePath, path.join(assetsDir(), name));
  return name;
}

export function assetAbsolutePath(rel: string): string {
  return path.join(assetsDir(), path.basename(rel));
}

export function appendResult(record: ResultRecord) {
  fs.appendFileSync(resultsPath(), JSON.stringify(record) + '\n', 'utf-8');
}

/**
 * 集計ログを空にする。消す前に必ず results-YYYYMMDD-HHMM.jsonl として同じ場所に退避するので、
 * 誤操作しても手で戻せる（フェイルセーフ）。
 */
export function clearResults(): { cleared: number; backup: string | null } {
  const rows = readResults();
  if (rows.length === 0) {
    fs.rmSync(resultsPath(), { force: true });
    return { cleared: 0, backup: null };
  }
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const backup = path.join(userDir(), `results-${stamp}.jsonl`);
  fs.copyFileSync(resultsPath(), backup);
  fs.writeFileSync(resultsPath(), '', 'utf-8');
  return { cleared: rows.length, backup };
}

export function readResults(): ResultRecord[] {
  try {
    return fs
      .readFileSync(resultsPath(), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as ResultRecord);
  } catch {
    return [];
  }
}
