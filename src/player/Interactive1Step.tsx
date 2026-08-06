import { useMemo, useState } from 'react';
import type { EmbeddingSource, Interactive1Content, NeighbourSource, RuriSize } from '../types';
import type { StepProps } from './PlayerApp';
import { api, errText } from '../lib/api';
import { isSubmitEnter } from '../lib/ime';
import { listJapaneseTokens, tokenize, type Tok } from '../lib/tokenizer';
import { listLlmJpVocab, tokenizeLlmJp } from '../lib/llmjp';
import { cosine, pca2, pseudoEmbed, tokenBorder, tokenColor } from '../lib/vec';
import { VOCABULARY } from '../content/vocabulary';

type Phase = 'input' | 'tokens' | 'vectors';

const EMBED_DIMS = 256;

interface EmbedSpec {
  source: EmbeddingSource;
  model: string;
  ruriSize: RuriSize;
}

/** 設定に応じて OpenAI かローカル Ruri を呼ぶ */
const runEmbed = (texts: string[], spec: EmbedSpec) =>
  spec.source === 'ruri'
    ? api.local.embed(texts, spec.ruriSize)
    : api.openai.embed(texts, spec.model, EMBED_DIMS);

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

const poolMemo = new Map<string, Pool>();

async function poolWords(source: NeighbourSource): Promise<string[]> {
  if (source === 'tokenizer') return listJapaneseTokens();
  if (source === 'llmjp') return listLlmJpVocab();
  return VOCABULARY;
}

const POOL_LABEL: Record<NeighbourSource, string> = {
  curated: '辞書',
  tokenizer: 'o200k_base 由来の日本語',
  llmjp: 'llm-jp 由来の日本語',
};

async function loadPool(source: NeighbourSource, spec: EmbedSpec): Promise<Pool> {
  const cacheKey =
    spec.source === 'ruri' ? `emb_${source}_ruri-${spec.ruriSize}` : `emb_${source}_${spec.model}_${EMBED_DIMS}`;
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
          mean: spec.source === 'ruri' ? meanVector(parsed.vectors) : null,
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
    pool = { words, vectors, offline: false, mean: spec.source === 'ruri' ? meanVector(vectors) : null };
    api.cache.write(cacheKey, JSON.stringify({ words: pool.words, vectors: pool.vectors })).catch(() => {});
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
  const [vectors, setVectors] = useState<number[][] | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  const mode = content.tokenizerMode ?? 'gpt';

  const run = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    // llm-jp は語彙ファイル（約100,000語）の読み込みが入るので少し待つことがある
    const result = mode === 'llmjp' ? await tokenizeLlmJp(t) : null;
    const { tokens: toks, approximate } = result ?? (await tokenize(t));
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
      ruriSize: content.ruriSize ?? '130m',
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

  /** 選んだトークンに意味が近いことばを、プール全体から探す */
  const neighbours = useMemo(() => {
    if (!vectors?.[selected] || !pool) return [];
    const target = centerVec(vectors[selected], pool.mean);
    const list = pool.vectors
      .map((v, i) => ({ i, word: pool.words[i], sim: cosine(target, centerVec(v, pool.mean)) }))
      .filter((x) => x.word !== tokens[selected]?.text)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5);
    // センタリング後の値は絶対値が小さくなるので、1位を100とした相対値で見せる
    const top = list[0]?.sim ?? 1;
    return list.map((x) => ({ ...x, shown: pool.mean ? x.sim / (top || 1) : x.sim }));
  }, [vectors, pool, selected, tokens]);

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

  /** トークンとプールを同じ空間で2次元に落とす */
  const projected = useMemo(() => {
    if (!vectors || !mapPool) return null;
    const all = pca2([...vectors, ...mapPool.vectors]);
    return { tokens: all.slice(0, vectors.length), vocab: all.slice(vectors.length) };
  }, [vectors, mapPool]);

  /* ---------- 入力 ---------- */
  if (phase === 'input') {
    return (
      <div className="stage">
        <span className="chip">体験①</span>
        <h1>{content.prompt}</h1>
        <p className="lead">入力した文が、AIの中でどう「数字」に変わるのか見てみよう。</p>
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
          {busy ? '準備中…' : 'トークンに分けてみる ▶'}
        </button>
      </div>
    );
  }

  /* ---------- トークン ---------- */
  if (phase === 'tokens') {
    return (
      <div className="stage fade-in">
        <span className="chip">STEP 1 — トークナイズ</span>
        <h2>文章は「トークン」という小さなかたまりに分けられる</h2>
        <div className="token-line">
          {tokens.map((t, i) => (
            <span key={i} className="token" style={{ background: tokenColor(i), borderColor: tokenBorder(i) }}>
              {t.text === ' ' ? '␣' : t.text}
              <span className="id">{t.id}</span>
            </span>
          ))}
        </div>
        <p className="lead">
          {tokens.length} 個のトークン ／ 下の数字がトークンID
          <br />
          <span style={{ fontSize: '.75em' }}>
            {approx
              ? '簡易分割'
              : mode === 'llmjp'
                ? '日本語向けに作られた llm-jp のトークナイザ'
                : 'GPT-4o と同じ o200k_base'}
          </span>
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
      <span className="chip">STEP 2 — ベクトル化（埋め込み）</span>
      <h2>トークンは「意味を表す数字の列」になる</h2>

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
        <div className="small muted">
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
          <div className="small muted">
            「{selectedText}」に意味が近いことば
            <br />
            <span style={{ fontSize: '.9em' }}>
              語彙: {POOL_LABEL[content.neighbourSource ?? 'curated']}（
              {pool ? pool.words.length.toLocaleString() : 0} 語） ／ 埋め込み:{' '}
              {(content.embeddingSource ?? 'openai') === 'ruri'
                ? `Ruri v3 ${content.ruriSize ?? '130m'}`
                : config.settings.embeddingModel}
            </span>
          </div>
          <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            {neighbours.map((n) => (
              <span key={n.word} className="neighbour">
                {n.word}
                <b>{(n.shown * 100).toFixed(0)}%</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="map-wrap">
        <div className="small muted" style={{ marginBottom: 6 }}>
          意味の地図（{mapPool ? mapPool.words.length : 0} 語と一緒に、2次元へ圧縮して配置
          {pool && mapPool && pool.words.length > mapPool.words.length
            ? `／全 ${pool.words.length.toLocaleString()} 語から間引き`
            : ''}
          ）
        </div>
        <Scatter
          vocabPoints={projected?.vocab ?? []}
          vocabLabels={mapPool?.words ?? []}
          highlight={new Set(neighbours.map((n) => mapPool?.idx.indexOf(n.i) ?? -1).filter((i) => i >= 0))}
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
}: {
  vocabPoints: Array<[number, number]>;
  vocabLabels: string[];
  highlight: Set<number>;
}) {
  const W = 1000;
  const H = 440;
  const pad = 40;
  const all = vocabPoints;
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
    </svg>
  );
}
