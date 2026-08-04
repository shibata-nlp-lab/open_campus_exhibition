import { useMemo, useState } from 'react';
import type { Interactive1Content } from '../types';
import type { StepProps } from './PlayerApp';
import { api, errText } from '../lib/api';
import { tokenize, type Tok } from '../lib/tokenizer';
import { cosine, heatColor, pca2, pseudoEmbed, tokenBorder, tokenColor } from '../lib/vec';

type Phase = 'input' | 'tokens' | 'vectors';

export default function Interactive1Step({ content, config, onFinish }: StepProps<Interactive1Content>) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [tokens, setTokens] = useState<Tok[]>([]);
  const [approx, setApprox] = useState(false);
  const [vectors, setVectors] = useState<number[][] | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  const run = async () => {
    const t = text.trim();
    if (!t) return;
    const { tokens: toks, approximate } = await tokenize(t);
    setTokens(toks.slice(0, 60));
    setApprox(approximate);
    setPhase('tokens');
  };

  const vectorize = async () => {
    setBusy(true);
    setError(null);
    try {
      const inputs = tokens.map((t) => t.text);
      const vecs = await api.openai.embed(inputs, config.settings.embeddingModel, 256);
      setVectors(vecs);
      setOffline(false);
    } catch (e) {
      setError(errText(e));
      setVectors(tokens.map((t) => pseudoEmbed(t.text, 64)));
      setOffline(true);
    } finally {
      setBusy(false);
      setPhase('vectors');
    }
  };

  const points = useMemo(() => (vectors ? pca2(vectors) : []), [vectors]);

  const neighbours = useMemo(() => {
    if (!vectors || !vectors[selected]) return [];
    return vectors
      .map((v, i) => ({ i, sim: cosine(vectors[selected], v) }))
      .filter((x) => x.i !== selected)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 3);
  }, [vectors, selected]);

  /* ---------- 入力フェーズ ---------- */
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
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        {content.examples.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {content.examples.map((ex) => (
              <button key={ex} className="btn sm" onClick={() => setText(ex)}>{ex}</button>
            ))}
          </div>
        )}
        <button className="btn lg primary" onClick={run} disabled={!text.trim()}>
          トークンに分けてみる ▶
        </button>
      </div>
    );
  }

  /* ---------- トークン表示 ---------- */
  if (phase === 'tokens') {
    return (
      <div className="stage fade-in">
        <span className="chip">STEP 1 — トークナイズ</span>
        <h2>文章は「トークン」という小さなかたまりに分けられる</h2>
        <div className="token-line">
          {tokens.map((t, i) => (
            <span
              key={i}
              className="token"
              style={{ background: tokenColor(i), borderColor: tokenBorder(i) }}
            >
              {t.text === ' ' ? '␣' : t.text}
              <span className="id">{t.id}</span>
            </span>
          ))}
        </div>
        <p className="lead">
          {tokens.length} 個のトークン
          {approx ? '（簡易分割）' : '（GPT系と同じ o200k_base）'}
          ／ 下の数字がトークンID
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

  /* ---------- ベクトル表示 ---------- */
  const vec = vectors?.[selected] ?? [];
  return (
    <div className="stage fade-in" style={{ gap: 16 }}>
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

      <div className="row" style={{ alignItems: 'flex-start', gap: 40, flexWrap: 'wrap', justifyContent: 'center' }}>
        <div>
          <div className="small muted" style={{ marginBottom: 8 }}>
            「{tokens[selected]?.text}」のベクトル（先頭 96 次元）
          </div>
          <div className="vec-grid">
            {vec.slice(0, 96).map((v, i) => (
              <div key={i} className="vec-cell" style={{ background: heatColor(v) }} title={v.toFixed(4)} />
            ))}
          </div>
          <div className="small muted mono" style={{ marginTop: 8 }}>
            [{vec.slice(0, 4).map((v) => v.toFixed(3)).join(', ')}, … ] 全 {vec.length} 次元
          </div>
          {neighbours.length > 0 && (
            <div className="small muted" style={{ marginTop: 12 }}>
              意味が近いトークン:{' '}
              {neighbours.map((n) => `${tokens[n.i].text}(${(n.sim * 100).toFixed(0)}%)`).join('  ')}
            </div>
          )}
        </div>

        <div>
          <div className="small muted" style={{ marginBottom: 8 }}>意味の地図（主成分分析で2次元に圧縮）</div>
          <Scatter points={points} labels={tokens.map((t) => t.text)} selected={selected} onSelect={setSelected} />
        </div>
      </div>

      <p className="lead" style={{ maxWidth: 900 }}>
        近い意味のことばは、近い場所に配置されます。LLMはこの数字の並びだけを見て計算しています。
      </p>
      <div className="row">
        <button className="btn lg" onClick={() => setPhase('input')}>もう一度</button>
        <button className="btn lg primary" onClick={onFinish}>次へすすむ ▶</button>
      </div>
    </div>
  );
}

function Scatter({
  points,
  labels,
  selected,
  onSelect,
}: {
  points: Array<[number, number]>;
  labels: string[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const W = 420;
  const H = 300;
  const pad = 30;
  if (points.length === 0) return <svg className="scatter" width={W} height={H} />;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const sx = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (W - pad * 2);
  const sy = (y: number) => H - pad - ((y - minY) / (maxY - minY || 1)) * (H - pad * 2);

  return (
    <svg className="scatter" width={W} height={H}>
      {points.map((p, i) => (
        <g key={i} onClick={() => onSelect(i)} style={{ cursor: 'pointer' }}>
          <circle
            cx={sx(p[0])}
            cy={sy(p[1])}
            r={i === selected ? 8 : 5}
            fill={i === selected ? '#6ee7c8' : '#4c8dff'}
            opacity={i === selected ? 1 : 0.75}
          />
          <text x={sx(p[0]) + 9} y={sy(p[1]) + 4} fontSize={11} fill="#93a2bd">
            {labels[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}
