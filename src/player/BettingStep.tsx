/**
 * 馬券風 次単語予想（裏モード）。
 *
 * その場で推論はしない。Colab で作った層ごとの確率を取り込んだものを使って、
 * 「次の単語の上位3つ」を馬券の形で当てる。仕様は
 * [docs/betting-mode.md](../../docs/betting-mode.md) を参照。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BettingContent, BettingRace } from '../types';
import type { StepProps } from './PlayerApp';
import {
  BET_LABELS,
  BET_ORDERED,
  BET_PICKS,
  type Bet,
  type BetKind,
  betKey,
  brackets,
  finishOrder,
  payout,
  raceOdds,
} from '../lib/odds';
import { buildRaceCurve, pickRaces, positionAt } from '../lib/race';
import Track from './RaceTrack';

type Phase = 'card' | 'race' | 'result' | 'over' | 'done';

const KINDS: BetKind[] = ['win', 'place', 'bracket', 'quinella', 'wide', 'exacta', 'trio', 'trifecta'];
const CHIPS = [100, 500, 1000, 5000, 10000];

const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;

export default function BettingStep({ content, onFinish, runKey }: StepProps<BettingContent>) {
  // 登録されたレースからその回のぶんを選び直す。R を押してやり直すと別の組み合わせになる
  const races = useMemo(
    () => pickRaces(content.races, Math.max(1, content.raceCount)),
    [content.races, content.raceCount, runKey]
  );
  const [index, setIndex] = useState(0);
  const [money, setMoney] = useState(content.startingMoney);
  const [phase, setPhase] = useState<Phase>('card');
  const [bets, setBets] = useState<Bet[]>([]);
  const [kind, setKind] = useState<BetKind>('win');
  const [picks, setPicks] = useState<number[]>([]);
  const [amount, setAmount] = useState(1000);

  const race: BettingRace | undefined = races[index];

  /** オッズと着順。シードが同じなら毎回同じ値になる */
  const table = useMemo(() => {
    if (!race) return null;
    const { win, odds } = raceOdds(race.entries, race.seed);
    const order = finishOrder(race.entries.map((e) => e.finalProb));
    const curve = buildRaceCurve(
      race.entries.map((e) => e.layerProbs),
      race.entries.map((e) => e.finalProb),
      content.metersPerLayer
    );
    return { win, odds, order, curve, frame: brackets(race.entries.length) };
  }, [race, content.metersPerLayer]);

  const staked = bets.reduce((a, b) => a + b.amount, 0);
  const refund = useMemo(() => {
    if (!table || !race) return 0;
    return bets.reduce((a, b) => a + payout(b, table.odds, table.order, race.entries.length), 0);
  }, [bets, table, race]);

  if (!race || !table) {
    return (
      <div className="stage">
        <h2>レースが登録されていません</h2>
        <p className="lead small">設定画面で races.csv を取り込んでください。</p>
        <button className="btn lg primary" onClick={onFinish}>次へ</button>
      </div>
    );
  }

  const need = BET_PICKS[kind];
  const ordered = BET_ORDERED[kind];
  const isBracket = kind === 'bracket';
  /** 枠連は枠番、それ以外は馬番（0始まり）を選ぶ */
  const options = isBracket ? [...new Set(table.frame)] : race.entries.map((_, i) => i);

  const togglePick = (v: number) => {
    setPicks((cur) => {
      if (cur.includes(v)) return cur.filter((x) => x !== v);
      if (cur.length >= need) return ordered ? [...cur.slice(1), v] : cur;
      return [...cur, v];
    });
  };

  const currentOdds = picks.length === need ? table.odds[kind].get(betKey(kind, picks)) : undefined;

  const addBet = () => {
    if (picks.length !== need || amount <= 0 || staked + amount > money) return;
    setBets((b) => [...b, { kind, picks: picks.slice(), amount }]);
    setPicks([]);
  };

  const startRace = () => {
    setMoney((m) => m - staked);
    setPhase('race');
  };

  const settle = () => {
    setMoney((m) => m + refund);
    setPhase('result');
  };

  const nextRace = () => {
    const after = money;
    if (after <= 0) return setPhase('over');
    if (index + 1 >= races.length) return setPhase('done');
    setIndex(index + 1);
    setBets([]);
    setPicks([]);
    if (content.refillPerRace) setMoney(content.startingMoney);
    setPhase('card');
  };

  /* ---------------- 精算・終了 ---------------- */

  if (phase === 'over' || phase === 'done') {
    const won = phase === 'done';
    return (
      <div className="stage fade-in">
        <span className="chip lg">{won ? '全レース終了' : 'ゲームオーバー'}</span>
        <h1 style={{ fontSize: 'clamp(34px, 5vw, 72px)' }}>{yen(money)}</h1>
        <p className="lead">
          {won
            ? money >= content.startingMoney
              ? `${yen(money - content.startingMoney)} のプラスです。`
              : `${yen(content.startingMoney - money)} のマイナスです。`
            : '資金が尽きました。'}
        </p>
        <button className="btn lg primary" onClick={onFinish}>終わる ▶</button>
      </div>
    );
  }

  /* ---------------- レース ---------------- */

  if (phase === 'race') {
    return (
      <RaceView
        race={race}
        curve={table.curve}
        frame={table.frame}
        order={table.order}
        onEnd={settle}
      />
    );
  }

  /* ---------------- 結果 ---------------- */

  if (phase === 'result') {
    return (
      <div className="stage scroll fade-in" style={{ gap: 12 }}>
        <span className="chip lg">{race.name} 確定</span>
        <div className="row" style={{ gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
          {table.order.slice(0, 3).map((i, r) => (
            <span key={i} className={`finish-badge r${r + 1}`}>
              <b>{r + 1}着</b> {race.entries[i].word}
              <span className="small muted"> {(race.entries[i].finalProb * 100).toFixed(1)}%</span>
            </span>
          ))}
        </div>
        <div className="settle">
          {bets.length === 0 && <p className="lead">馬券を買っていません。</p>}
          {bets.map((b, i) => {
            const p = payout(b, table.odds, table.order, race.entries.length);
            return (
              <div key={i} className={`settle-row ${p > 0 ? 'hit' : ''}`}>
                <span>{BET_LABELS[b.kind]}</span>
                <span className="mono">{labelOf(b, race, isBracketKind(b.kind))}</span>
                <span className="mono">{yen(b.amount)}</span>
                <span className="mono">{p > 0 ? `→ ${yen(p)}` : '—'}</span>
              </div>
            );
          })}
        </div>
        <h2 style={{ margin: 0 }}>
          払戻 {yen(refund)} ／ 所持金 {yen(money)}
        </h2>
        <button className="btn lg primary" onClick={nextRace}>
          {index + 1 >= races.length ? '結果を見る ▶' : '次のレースへ ▶'}
        </button>
      </div>
    );
  }

  /* ---------------- 馬柱・投票 ---------------- */

  return (
    <div className="stage scroll fade-in betting-card" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', width: 'min(1600px, 96vw)' }}>
        <span className="chip lg">
          {race.name}（{index + 1}/{races.length}）
        </span>
        <span className="chip lg">所持金 {yen(money - staked)}</span>
      </div>
      <h2 style={{ margin: 0 }}>
        「{race.prompt}」の<b>次の単語</b>は？
      </h2>
      <p className="lead small">
        {race.model} ／ {table.curve.distance}m（{race.entries[0].layerProbs.length}層）
      </p>

      <table className="racecard">
        <thead>
          <tr>
            <th>枠</th>
            <th>馬番</th>
            <th>単語</th>
            <th>単勝</th>
            <th>複勝</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {race.entries.map((e, i) => {
            const sel = isBracket ? picks.includes(table.frame[i]) : picks.includes(i);
            const pick = isBracket ? table.frame[i] : i;
            return (
              <tr key={i} className={sel ? 'sel' : ''} onClick={() => togglePick(pick)}>
                <td>
                  <span className={`waku w${table.frame[i]}`}>{table.frame[i]}</span>
                </td>
                <td className="mono">{i + 1}</td>
                <td className="word">{e.word}</td>
                <td className="mono odds">{table.win[i].toFixed(1)}</td>
                <td className="mono">{(table.odds.place.get(betKey('place', [i])) ?? 0).toFixed(1)}</td>
                <td className="mono sel-order">
                  {ordered && picks.indexOf(pick) >= 0 ? `${picks.indexOf(pick) + 1}着` : sel ? '✓' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="bet-panel">
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {KINDS.map((k) => (
            <button
              key={k}
              className={`btn sm ${k === kind ? 'primary' : ''}`}
              onClick={() => {
                setKind(k);
                setPicks([]);
              }}
            >
              {BET_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span className="small muted">
            {ordered ? '着順どおりに' : ''}
            {need}つ選ぶ（{picks.length}/{need}）
            {isBracket ? '／枠を選択' : ''}
          </span>
          {CHIPS.map((c) => (
            <button key={c} className={`btn sm ${amount === c ? 'primary' : ''}`} onClick={() => setAmount(c)}>
              {c.toLocaleString('ja-JP')}
            </button>
          ))}
          <button
            className="btn sm"
            disabled={picks.length !== need || staked + amount > money}
            onClick={addBet}
          >
            + 追加{currentOdds ? `（${currentOdds.toFixed(1)}倍）` : ''}
          </button>
        </div>
        {bets.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {bets.map((b, i) => (
              <span key={i} className="ticket" onClick={() => setBets(bets.filter((_, k) => k !== i))}>
                {BET_LABELS[b.kind]} {labelOf(b, race, isBracketKind(b.kind))} {yen(b.amount)} ✕
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="row">
        <span className="lead">投票 {yen(staked)}</span>
        <button className="btn lg primary" onClick={startRace} disabled={bets.length === 0}>
          発走 ▶
        </button>
      </div>
    </div>
  );
}

const isBracketKind = (k: BetKind) => k === 'bracket';

/** 馬券の表示。枠連は枠番、それ以外は馬番（1始まり）で出す */
function labelOf(b: Bet, race: BettingRace, bracket: boolean): string {
  const sep = BET_ORDERED[b.kind] ? '→' : '-';
  if (bracket) return b.picks.join(sep);
  return b.picks.map((i) => `${i + 1}${race.entries[i] ? `(${race.entries[i].word})` : ''}`).join(sep);
}

/* ---------------- レースの進行 ---------------- */

function RaceView({
  race,
  curve,
  frame,
  order,
  onEnd,
}: {
  race: BettingRace;
  curve: ReturnType<typeof buildRaceCurve>;
  frame: number[];
  order: number[];
  onEnd: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);
  // 距離に応じて時間を決める。2400m でおよそ 15 秒
  const duration = 8000 + curve.distance * 3;

  useEffect(() => {
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [duration]);

  const done = progress >= 1;
  const positions = curve.positions.map((p) => positionAt(p, progress));
  const live = positions
    .map((x, i) => ({ x, i }))
    .sort((a, b) => b.x - a.x)
    .slice(0, 5);

  return (
    <div className="stage fade-in" style={{ gap: 10, justifyContent: 'center' }}>
      <div className="row" style={{ justifyContent: 'space-between', width: 'min(1600px, 96vw)' }}>
        <span className="chip lg">{race.name}</span>
        <span className="chip lg mono">
          残り {Math.max(0, Math.round(curve.distance * (1 - progress)))}m
        </span>
      </div>

      <Track
        positions={positions}
        frame={frame}
        words={race.entries.map((e) => e.word)}
        distance={curve.distance}
        running={!done}
      />

      <div className="row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {live.map((h, r) => (
          <span key={h.i} className="live-rank">
            <b>{r + 1}</b> {race.entries[h.i].word}
          </span>
        ))}
      </div>

      {done && (
        <button className="btn lg primary" onClick={onEnd}>
          確定（1着 {race.entries[order[0]].word}） ▶
        </button>
      )}
    </div>
  );
}
