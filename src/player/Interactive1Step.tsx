import { useMemo, useState } from 'react';
import type {
  EmbeddingSource,
  Interactive1Content,
  LlmJpSize,
  NeighbourSource,
  RuriSize,
  TokenizerMode,
} from '../types';
import type { StepProps } from './PlayerApp';
import { api, errText } from '../lib/api';
import { isSubmitEnter } from '../lib/ime';
import { listJapaneseTokens, tokenize, type Tok } from '../lib/tokenizer';
import { idsForTexts, listLlmJpVocab, tokenizeLlmJp } from '../lib/llmjp';
import { cosine, pca2, pseudoEmbed, tokenBorder, tokenColor } from '../lib/vec';
import { VOCABULARY } from '../content/vocabulary';

type Phase = 'input' | 'tokens' | 'vectors';

const EMBED_DIMS = 256;

interface EmbedSpec {
  source: EmbeddingSource;
  model: string;
  ruriSize: RuriSize;
  llmjpSize: LlmJpSize;
}

/** 設定に応じて OpenAI / ローカル Ruri / llm-jp の埋め込み層 を呼ぶ */
async function runEmbed(texts: string[], spec: EmbedSpec): Promise<number[][]> {
  if (spec.source === 'ruri') return api.local.embed(texts, spec.ruriSize);
  if (spec.source === 'llmjp') {
    // 分割はここ（語彙ファイルがレンダラ側にある）。メインへは トークンID だけ渡す
    return api.llmjp.embed(await idsForTexts(texts), spec.llmjpSize);
  }
  return api.openai.embed(texts, spec.model, EMBED_DIMS);
}

/** 単語だけを入れると向きが偏るモデル。プール平均を引いて比べる */
const needsCentering = (source: EmbeddingSource) => source === 'ruri' || source === 'llmjp';

/**
 * 候補プール（語とその埋め込み）。
 * 語数が多い tokenizer 側は取得に時間がかかるので、ディスクにも保存して次回起動時は読むだけにする。
 */
interface Pool {
  words: string[];
  vectors: number[][];
  offline: boolean;
  /**
   * Ruri のような文用の埋め込みモデルは、単語だけを入れると全ベクトルが似た向きに偏り
   * （異方性）、コサイン類似度が 0.85〜0.90 に潰れて順位が意味と合わなくなる。
   * プール全体の平均を引いてから正規化すると、意味の差がはっきり出る。
   */
  mean: number[] | null;
}

/** 平均を引いて正規化する */
function centerVec(v: number[], mean: number[] | null): number[] {
  if (!mean || mean.length !== v.length) return v;
  const c = v.map((x, i) => x - mean[i]);
  const n = Math.sqrt(c.reduce((a, x) => a + x * x, 0)) || 1;
  return c.map((x) => x / n);
}

function meanVector(vectors: number[][]): number[] {
  const d = vectors[0]?.length ?? 0;
  const m = new Array<number>(d).fill(0);
  for (const v of vectors) for (let k = 0; k < d; k++) m[k] += v[k] / vectors.length;
  return m;
}

/** Ruri のトークナイザはメインプロセス側にあるので IPC 越しに呼ぶ */
async function tokenizeWithRuri(text: string, size: RuriSize): Promise<{ tokens: Tok[]; approximate: boolean } | null> {
  try {
    return { tokens: await api.local.tokenize(text, size), approximate: false };
  } catch (e) {
    console.warn('ruri tokenize failed', e);
    return null;
  }
}

const poolMemo = new Map<string, Pool>();

async function poolWords(source: NeighbourSource): Promise<string[]> {
  if (source === 'tokenizer') return listJapaneseTokens();
  if (source === 'llmjp') return listLlmJpVocab();
  return VOCABULARY;
}

async function loadPool(source: NeighbourSource, spec: EmbedSpec): Promise<Pool> {
  const cacheKey =
    spec.source === 'ruri'
      ? `emb_${source}_ruri-${spec.ruriSize}`
      : spec.source === 'llmjp'
        ? `emb_${source}_llmjp-${spec.llmjpSize}`
        : `emb_${source}_${spec.model}_${EMBED_DIMS}`;
  const memo = poolMemo.get(cacheKey);
  if (memo) return memo;

  const words = await poolWords(source);

  // ディスクキャッシュ（語数と語の内容が一致するときだけ使う）
  try {
    const raw = await api.cache.read(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { words: string[]; vectors: number[][] };
      if (parsed.words.length === words.length && parsed.words[0] === words[0]) {
        const pool = {
          words: parsed.words,
          vectors: parsed.vectors,
          offline: false,
          mean: needsCentering(spec.source) ? meanVector(parsed.vectors) : null,
        };
        poolMemo.set(cacheKey, pool);
        return pool;
      }
    }
  } catch {
    /* 壊れていたら取り直す */
  }

  let pool: Pool;
  try {
    const vectors = await runEmbed(words, spec);
    pool = { words, vectors, offline: false, mean: needsCentering(spec.source) ? meanVector(vectors) : null };
    // 小数4桁で十分（順位は変わらない）。生のまま書くとキャッシュが数倍に膨らむ
    const compact = pool.vectors.map((v) => v.map((x) => Math.round(x * 1e4) / 1e4));
    api.cache.write(cacheKey, JSON.stringify({ words: pool.words, vectors: compact })).catch(() => {});
  } catch {
    // 次元をそろえないと類似度が NaN になるので、疑似ベクトルも同じ次元で作る
    pool = { words, vectors: words.map((w) => pseudoEmbed(w, EMBED_DIMS)), offline: true, mean: null };
  }
  poolMemo.set(cacheKey, pool);
  return pool;
}

export default function Interactive1Step({ content, config, onFinish }: StepProps<Interactive1Content>) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [tokens, setTokens] = useState<Tok[]>([]);
  const [approx, setApprox] = useState(false);
  /** 実際に分割に使えたトークナイザ（読み込みに失敗すると gpt に落ちる） */
  const [usedMode, setUsedMode] = useState<TokenizerMode>('gpt');
  const [vectors, setVectors] = useState<number[][] | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  const mode = content.tokenizerMode ?? 'gpt';
  const ruriSize = content.ruriSize ?? '130m';
  const llmjpSize = content.llmjpSize ?? '150m';
  /** 単語の下に番号（トークンID）を出すか */
  const showId = content.showTokenId ?? true;

  const run = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    // llm-jp は語彙ファイル（約100,000語）の読み込み、Ruri は初回だけトークナイザの
    // ダウンロード（7MB弱）が入るので少し待つことがある。失敗したら GPT の分割に落とす。
    let result: { tokens: Tok[]; approximate: boolean } | null = null;
    if (mode === 'llmjp') result = await tokenizeLlmJp(t);
    else if (mode === 'ruri') result = await tokenizeWithRuri(t, ruriSize);
    const { tokens: toks, approximate } = result ?? (await tokenize(t));
    setUsedMode(result ? mode : 'gpt'); // 読み込みに失敗したら o200k_base で分割している
    setBusy(false);
    setTokens(toks.slice(0, 40));
    setApprox(approximate);
    setSelected(0);
    setPhase('tokens');
  };

  const vectorize = async () => {
    setBusy(true);
    setError(null);
    const source = content.neighbourSource ?? 'curated';
    const spec: EmbedSpec = {
      source: content.embeddingSource ?? 'openai',
      model: config.settings.embeddingModel,
      ruriSize,
      llmjpSize,
    };
    const texts = tokens.map((t) => t.text);
    try {
      // 先にプールを用意する。プールがオフラインなら入力側もオフラインに揃える
      // （実埋め込みと疑似ベクトルを混ぜると比較が成立しない）
      const p = await loadPool(source, spec);
      setPool(p);
      if (p.offline) {
        setVectors(texts.map((t) => pseudoEmbed(t, EMBED_DIMS)));
        setOffline(true);
      } else {
        setVectors(await runEmbed(texts, spec));
        setOffline(false);
      }
    } catch (e) {
      setError(errText(e));
      const words = await poolWords(source);
      setPool({ words, vectors: words.map((w) => pseudoEmbed(w, EMBED_DIMS)), offline: true, mean: null });
      setVectors(texts.map((t) => pseudoEmbed(t, EMBED_DIMS)));
      setOffline(true);
    } finally {
      setBusy(false);
      setPhase('vectors');
    }
  };

  /** 選んだ単語に意味が近いことばを、プール全体から探す */
  const neighbours = useMemo(() => {
    if (!vectors?.[selected] || !pool) return [];
    const target = centerVec(vectors[selected], pool.mean);
    const list = pool.vectors
      .map((v, i) => ({ i, word: pool.words[i], sim: cosine(target, centerVec(v, pool.mean)) }))
      .filter((x) => x.word !== tokens[selected]?.text)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5);
    // relative: 1位を100とした相対値（中心化すると絶対値が小さくなるため）
    // cosine:   コサイン類似度そのもの
    const top = list[0]?.sim ?? 1;
    const relative = (content.similarityDisplay ?? 'relative') === 'relative';
    return list.map((x) => ({ ...x, shown: relative ? x.sim / (top || 1) : x.sim }));
  }, [vectors, pool, selected, tokens, content.similarityDisplay]);

  /**
   * 地図用のプール。数千語をそのまま描くと潰れるので間引く。
   * 近傍として選ばれた語は必ず残す。
   */
  const mapPool = useMemo(() => {
    if (!pool) return null;
    const MAX = 260;
    const keep = new Set(neighbours.map((n) => n.i));
    if (pool.words.length > MAX) {
      const step = Math.ceil(pool.words.length / MAX);
      for (let i = 0; i < pool.words.length; i += step) keep.add(i);
    } else {
      for (let i = 0; i < pool.words.length; i++) keep.add(i);
    }
    const idx = [...keep].sort((a, b) => a - b);
    return { idx, words: idx.map((i) => pool.words[i]), vectors: idx.map((i) => pool.vectors[i]) };
  }, [pool, neighbours]);

  /** 単語とプールを同じ空間で2次元に落とす */
  const projected = useMemo(() => {
    if (!vectors || !mapPool) return null;
    const all = pca2([...vectors, ...mapPool.vectors]);
    return { tokens: all.slice(0, vectors.length), vocab: all.slice(vectors.length) };
  }, [vectors, mapPool]);

  /* ---------- 入力 ---------- */
  if (phase === 'input') {
    return (
      <div className="stage entry">
        <span className="chip lg">体験①</span>
        {/* 一番言いたいのは「何が起きるか」なので、そちらを見出しに。入力のお願いはその下 */}
        <h1>入力した文が、AIの中でどう「数字」に変わるのか見てみよう。</h1>
        <p className="lead">{content.prompt}</p>
        <input
          className="big-input"
          autoFocus
          placeholder={content.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => isSubmitEnter(e) && run()}
        />
        {content.examples.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {content.examples.map((ex) => (
              <button key={ex} className="btn sm" onClick={() => setText(ex)}>{ex}</button>
            ))}
          </div>
        )}
        <button className="btn lg primary" onClick={run} disabled={!text.trim() || busy}>
          {busy ? '準備中…' : '単語に分けてみる ▶'}
        </button>
      </div>
    );
  }

  /* ---------- 単語分割 ---------- */
  if (phase === 'tokens') {
    return (
      <div className="stage fade-in">
        <span className="chip lg">STEP 1 — 単語分割</span>
        <h2>文章は「単語」の小さなかたまりに分けられる</h2>
        <div className="token-line">
          {tokens.map((t, i) => (
            <span key={i} className="token" style={{ background: tokenColor(i), borderColor: tokenBorder(i) }}>
              {t.text === ' ' ? '␣' : t.text}
              {showId && <span className="id">{t.id}</span>}
            </span>
          ))}
        </div>
        <p className="lead">
          {tokens.length} 個の単語{showId ? ' ／ 下の数字は単語につけられた番号' : ''}
        </p>
        <div className="row">
          <button className="btn lg" onClick={() => setPhase('input')}>入力しなおす</button>
          <button className="btn lg primary" onClick={vectorize} disabled={busy}>
            数字のベクトルにする ▶
          </button>
        </div>
      </div>
    );
  }

  /* ---------- ベクトル ---------- */
  const vec = vectors?.[selected] ?? [];
  const selectedText = tokens[selected]?.text ?? '';

  return (
    <div className="stage scroll fade-in" style={{ gap: 14 }}>
      <span className="chip lg">STEP 2 — ベクトル化</span>
      <h2>単語は「意味を表す数字の列」になる</h2>

      {busy && <div className="spin" />}
      {offline && (
        <div className="banner warn">
          オンラインの埋め込みを取得できなかったため、オフライン用の疑似ベクトルを表示しています。{error ? `（${error}）` : ''}
        </div>
      )}

      <div className="token-line">
        {tokens.map((t, i) => (
          <span
            key={i}
            className="token"
            onClick={() => setSelected(i)}
            style={{
              background: tokenColor(i),
              borderColor: i === selected ? '#fff' : tokenBorder(i),
              cursor: 'pointer',
              outline: i === selected ? '2px solid var(--accent)' : 'none',
            }}
          >
            {t.text === ' ' ? '␣' : t.text}
          </span>
        ))}
      </div>

      <div className="vec-numbers">
        <div className="sub-caption">
          「{selectedText}」は、こんな <b>{vec.length} 次元のベクトル</b> になっている
        </div>
        <div className="vector">
          <span className="brk left" />
          <div className="vector-items">
            {vec.slice(0, 6).map((v, i) => (
              <span key={i} className={`vec-num ${v >= 0 ? 'pos' : 'neg'}`}>
                {v >= 0 ? '+' : '−'}
                {Math.abs(v).toFixed(3)}
              </span>
            ))}
            <span className="vec-tail">
              <span className="vec-dots">⋯</span>
              <span className="vec-rest">あと {Math.max(0, vec.length - 6)} 個</span>
            </span>
          </div>
          <span className="brk right" />
        </div>
      </div>

      {neighbours.length > 0 && (
        <div className="neighbours">
          <div className="sub-caption">「{selectedText}」に意味が近いことば</div>
          <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            {neighbours.map((n) => (
              <span key={n.word} className="neighbour">
                {n.word}
                {/* % だと「割合」に読めてしまうので、0〜1 の数値のまま出す */}
                <b>{n.shown.toFixed(2)}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="map-wrap">
        <Scatter
          vocabPoints={projected?.vocab ?? []}
          vocabLabels={mapPool?.words ?? []}
          highlight={new Set(neighbours.map((n) => mapPool?.idx.indexOf(n.i) ?? -1).filter((i) => i >= 0))}
          target={projected?.tokens[selected] ?? null}
          targetLabel={selectedText}
        />
      </div>

      <p className="lead" style={{ maxWidth: 1000 }}>
        近い意味のことばは、近い場所に集まります。LLMはこの数字の並びだけを見て計算しています。
      </p>
      <div className="row">
        <button className="btn lg" onClick={() => setPhase('input')}>もう一度</button>
        <button className="btn lg primary" onClick={onFinish}>次へすすむ ▶</button>
      </div>
    </div>
  );
}

function Scatter({
  vocabPoints,
  vocabLabels,
  highlight,
  target,
  targetLabel,
}: {
  vocabPoints: Array<[number, number]>;
  vocabLabels: string[];
  highlight: Set<number>;
  /** いま選んでいる単語。青い点で出す */
  target?: [number, number] | null;
  targetLabel?: string;
}) {
  const W = 1000;
  const H = 440;
  const pad = 40;
  // 選んだ単語が端に来ても切れないよう、目盛りの範囲は語彙と一緒に決める
  const all = target ? [...vocabPoints, target] : vocabPoints;
  if (all.length === 0) return <svg className="scatter" width="100%" viewBox={`0 0 ${W} ${H}`} />;

  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const sx = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (W - pad * 2);
  const sy = (y: number) => H - pad - ((y - minY) / (maxY - minY || 1)) * (H - pad * 2);

  return (
    <svg className="scatter" width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {/* 語彙（背景）。近いと判定されたものだけラベルを出す */}
      {vocabPoints.map((p, i) => {
        const on = highlight.has(i);
        return (
          <g key={`v${i}`}>
            <circle cx={sx(p[0])} cy={sy(p[1])} r={on ? 6 : 3} fill={on ? '#6ee7c8' : '#3a4a6b'} opacity={on ? 1 : 0.45} />
            {on && (
              <text x={sx(p[0]) + 9} y={sy(p[1]) + 5} fontSize={16} fill="#6ee7c8">
                {vocabLabels[i]}
              </text>
            )}
          </g>
        );
      })}

      {/* いま選んでいる単語。近いことば（緑）と見分けがつくよう青で、いちばん上に描く */}
      {target && (
        <g>
          <circle cx={sx(target[0])} cy={sy(target[1])} r={11} fill="#5aa9ff" opacity={0.25} />
          <circle cx={sx(target[0])} cy={sy(target[1])} r={6.5} fill="#5aa9ff" stroke="#fff" strokeWidth={2} />
          {/* 近くに語が固まっても読めるよう、背景色で縁取りしてから塗る */}
          {targetLabel && (
            <text
              x={sx(target[0]) + 14}
              y={sy(target[1]) + 6}
              fontSize={19}
              fontWeight={700}
              fill="#8cc6ff"
              stroke="#0b1220"
              strokeWidth={4}
              paintOrder="stroke"
            >
              {targetLabel}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
