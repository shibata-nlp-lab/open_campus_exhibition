import { useCallback, useEffect, useRef, useState } from 'react';
import type { Interactive2Content, Interactive2Phase, TokenCandidate } from '../types';
import type { StepProps } from './PlayerApp';
import { api, errText } from '../lib/api';
import { isSubmitEnter } from '../lib/ime';
import { useAudio } from './useAudio';
import { useAuto, useAutoTimer } from './useAuto';

/** API が使えないときの簡易候補（デモ継続用） */
function offlineCandidates(text: string, topK: number): TokenCandidate[] {
  const pools: Array<[RegExp, string[]]> = [
    [/は$/, ['とても', '今日', '少し', 'まだ', 'きっと']],
    [/を$/, ['食べ', '見', '作っ', '持っ', '考え']],
    [/が$/, ['好き', 'ある', 'できる', '多い', '必要']],
    [/に$/, ['なる', 'いる', '行く', 'ついて', 'する']],
  ];
  const base = pools.find(([re]) => re.test(text))?.[1] ?? ['です', 'ます', 'ました', 'ですが', 'ので'];
  const raw = base.slice(0, topK).map((t, i) => Math.exp(-i * 0.8));
  const sum = raw.reduce((a, b) => a + b, 0);
  return base.slice(0, topK).map((token, i) => ({
    token,
    prob: raw[i] / sum,
    logprob: Math.log(raw[i] / sum),
  }));
}

export default function Interactive2Step({ content, config, onFinish }: StepProps<Interactive2Content>) {
  const [seed, setSeed] = useState('');
  const [started, setStarted] = useState(false);
  const [text, setText] = useState('');
  const [lastToken, setLastToken] = useState('');
  const [cands, setCands] = useState<TokenCandidate[]>([]);
  const [steps, setSteps] = useState(0);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  /**
   * 画面ごとの音声。1語選んだあとは 'pick' に切り替える（同じ画面でも説明が変わるため）。
   * 切り替わると前の画面の音は止まる。
   */
  const phase: Interactive2Phase = !started ? 'input' : steps === 0 ? 'predict' : 'pick';
  const audio = useAudio(content.screenAudio?.[phase]);

  // StrictMode（開発時）は mount → cleanup → 再 mount するため、
  // 立ち上がりで必ず true に戻さないとフラグが false のままになり応答を捨て続ける
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // ローカルのモデルは初回だけ読み込み（取得済みで1秒ほど、未取得ならダウンロード）が
  // 入る。来場者が入力している間に済ませておく
  useEffect(() => {
    if (content.predictSource === 'local') api.predict.prepare(content.predictModelId ?? '150m').catch(() => {});
  }, [content.predictSource, content.predictModelId]);

  const fetchCands = useCallback(
    async (current: string) => {
      setBusy(true);
      setError(null);
      try {
        const c =
          content.predictSource === 'local'
            ? await api.predict.nextTokens(current, content.topK, content.predictModelId ?? '150m')
            : await api.openai.nextTokens(current, content.topK, config.settings.chatModel);
        if (!alive.current) return;
        setCands(c);
        setOffline(false);
      } catch (e) {
        if (!alive.current) return;
        setError(errText(e));
        setCands(offlineCandidates(current, content.topK));
        setOffline(true);
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [content.topK, content.predictSource, content.predictModelId, config.settings.chatModel]
  );

  /** override は自動モード用。setSeed の反映を待たずに走らせるために渡す */
  const start = async (override?: string) => {
    const t = (override ?? seed).trim();
    if (!t) return;
    setText(t);
    setStarted(true);
    setSteps(0);
    await fetchCands(t);
  };

  const pick = useCallback(
    async (tok: string) => {
      const nextText = text + tok;
      setText(nextText);
      setLastToken(tok);
      setSteps((s) => s + 1);
      if (steps + 1 >= content.maxSteps) {
        setCands([]);
        return;
      }
      await fetchCands(nextText);
    },
    [text, steps, content.maxSteps, fetchCands]
  );

  /* ---------- 自動モード ---------- */
  const { auto } = useAuto();
  // 入力欄にも文字を出しておく（来場者から見て、入力されたように見せるため）
  useEffect(() => {
    if (auto && !started && !seed) setSeed(content.autoSeed ?? '');
  }, [auto, started, seed, content.autoSeed]);

  const autoPickCount = Math.max(1, content.autoPickCount ?? 5);
  useAutoTimer({
    enabled: auto && !busy,
    audioEnded: audio.ended,
    sec: content.screenAutoSec?.[phase],
    // 1語選ぶたびに待ち直す
    key: `${phase}_${steps}`,
    fire: () => {
      if (!started) return void start(content.autoSeed);
      // 決めた回数まで選んだら次のコンテンツへ。候補が尽きたときも同じ
      if (steps >= autoPickCount || cands.length === 0) return onFinish();
      const at = Math.min(Math.max(0, content.autoPickIndex ?? 0), cands.length - 1);
      void pick(cands[at].token);
    },
  });

  // 自動モード（設定の autoPickTop）：1位を一定間隔で採用
  useEffect(() => {
    if (!started || !content.autoPickTop || busy || cands.length === 0) return;
    const t = window.setTimeout(() => pick(cands[0].token), 900);
    return () => window.clearTimeout(t);
  }, [started, content.autoPickTop, busy, cands, pick]);

  if (!started) {
    return (
      <div className="stage entry">
        <span className="chip lg">体験②</span>
        <h1>{content.prompt}</h1>
        <p className="lead">AIは「次に来ることば」を確率で予想しています。実際にやらせてみよう。</p>
        <input
          className="big-input"
          autoFocus
          placeholder={content.placeholder}
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          onKeyDown={(e) => isSubmitEnter(e) && start()}
        />
        {content.examples.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {content.examples.map((ex) => (
              <button key={ex} className="btn sm" onClick={() => setSeed(ex)}>{ex}</button>
            ))}
          </div>
        )}
        <button className="btn lg primary" onClick={() => start()} disabled={!seed.trim()}>
          予想させてみる ▶
        </button>
      </div>
    );
  }

  const finished = steps >= content.maxSteps || (cands.length === 0 && !busy);

  return (
    <div className="stage predict fade-in">
      <div className="row">
        <span className="chip lg">次の1語を予測中</span>
        {offline && <span className="chip" style={{ background: '#37291a', color: '#ffd9a1' }}>オフライン簡易モード</span>}
      </div>

      <div className="generated">
        {text.slice(0, text.length - lastToken.length)}
        <span className="new">{lastToken}</span>
        <span style={{ opacity: 0.35 }}>▌</span>
      </div>

      {busy && <div className="spin" />}

      {!busy && cands.length > 0 && (
        <>
          <p className="lead">
            {content.autoPickTop ? '確率がいちばん高いものを選んでいます' : '次に来ることばを1つ選んでみよう'}
          </p>
          <div className="cand-list">
            {cands.map((c, i) => (
              <button
                key={i}
                className="cand"
                onClick={() => !content.autoPickTop && pick(c.token)}
                disabled={content.autoPickTop}
              >
                <div className="fill" style={{ width: `${Math.min(100, c.prob * 100)}%` }} />
                <span className="tok">{c.token === ' ' ? '␣' : c.token.replace(/\n/g, '⏎')}</span>
                <span className="p">{(c.prob * 100).toFixed(1)}%</span>
              </button>
            ))}
          </div>
          <p className="small muted">
            {steps} / {content.maxSteps} 語ぶん生成 — LLMはこの「選ぶ」を延々くり返しているだけです
          </p>
        </>
      )}

      {finished && (
        <div className="col fade-in" style={{ alignItems: 'center' }}>
          <h2>これがLLMの文章生成です</h2>
          <p className="lead" style={{ maxWidth: 900 }}>
            次の語の確率を計算 → 1つ選ぶ → また計算。このくり返しで文章ができています。
          </p>
        </div>
      )}

      {error && !offline && <div className="banner error">{error}</div>}

      <div className="row">
        <button className="btn lg" onClick={() => { setStarted(false); setText(''); setCands([]); setLastToken(''); }}>
          もう一度
        </button>
        <button className="btn lg primary" onClick={onFinish}>次へすすむ ▶</button>
      </div>
    </div>
  );
}
