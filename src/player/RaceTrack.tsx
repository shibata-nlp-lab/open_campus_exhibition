/**
 * 2D のオーバルコース。距離から座標と向きを出して馬を並べる。
 * 幾何は [src/lib/track.ts](../lib/track.ts) に置いてあり、ここは描くだけ。
 */
import Horse from './assets/Horse';
import { laneOffset, LAP_METERS, perimeter, pointAt, racePoint, type TrackShape } from '../lib/track';

const W = 1000;
const H = 520;
const SHAPE: TrackShape = { straight: 520, radius: 176, cx: W / 2, cy: H / 2 };
/** 内ラチ・外ラチの位置（コース中心線からのずれ） */
const RAIL_IN = -20;
const RAIL_OUT = 78;
/** いちばん外の馬とラチのあいだに残す余白 */
const RAIL_MARGIN = 12;

/** コースの内ラチ・外ラチを描くためのパス */
function railPath(offset: number): string {
  const steps = 240;
  const P = perimeter(SHAPE);
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = pointAt(SHAPE, (P * i) / steps);
    const o = laneOffset(p, offset, 1);
    pts.push(`${i === 0 ? 'M' : 'L'}${o.x.toFixed(1)} ${o.y.toFixed(1)}`);
  }
  return pts.join(' ') + ' Z';
}

const INNER = railPath(RAIL_IN);
const OUTER = railPath(RAIL_OUT);

export default function RaceTrack({
  positions,
  frame,
  words,
  distance,
  running,
}: {
  /** 各馬の進んだ距離（m） */
  positions: number[];
  frame: number[];
  words: string[];
  distance: number;
  running: boolean;
}) {
  const goal = pointAt(SHAPE, 0);
  // 先頭の馬を目立たせる
  const lead = positions.reduce((best, x, i) => (x > positions[best] ? i : best), 0);
  // 頭数が変わってもラチの内側に収まるよう、レーン間隔は頭数から決める
  const laneGap = (RAIL_OUT - RAIL_MARGIN) / Math.max(1, positions.length - 1);
  const goalDeg = (goal.heading * 180) / Math.PI;
  // 後ろの馬から描くと、先頭が手前に来て見やすい
  const sorted = positions.map((m, i) => ({ m, i })).sort((a, b) => a.m - b.m);
  const labelled = new Set(sorted.slice(-5).map((s) => s.i));

  return (
    <svg className="racetrack" viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
      {/* 芝 */}
      <rect x={0} y={0} width={W} height={H} rx={18} fill="#0d2415" />
      <path d={OUTER} fill="#1d5c33" stroke="#2f7a47" strokeWidth={2} />
      <path d={INNER} fill="#0d2415" stroke="#2f7a47" strokeWidth={2} />

      {/* ゴール板。板はコースに直交させ、文字だけは回転を戻して水平に置く */}
      <g transform={`translate(${goal.x} ${goal.y}) rotate(${goalDeg})`}>
        <rect x={-2} y={RAIL_IN} width={4} height={RAIL_OUT - RAIL_IN} fill="#ffffff" opacity={0.85} />
        <g transform={`translate(0 ${RAIL_OUT + 4}) rotate(${-goalDeg})`}>
          <text x={0} y={12} fontSize={15} textAnchor="middle" fill="#e8eefc" fontWeight={700}>
            GOAL
          </text>
        </g>
      </g>

      {/* 距離表示 */}
      <text x={W / 2} y={H / 2 - 4} fontSize={26} textAnchor="middle" fill="#7f8ea8" fontWeight={700}>
        {distance}m
      </text>
      <text x={W / 2} y={H / 2 + 20} fontSize={14} textAnchor="middle" fill="#5d6b84">
        {(distance / LAP_METERS).toFixed(2)} 周
      </text>

      {/* 馬。後ろの馬から描いて、先頭が上に来るようにする */}
      {sorted.map(({ m, i }) => {
        const p = laneOffset(racePoint(SHAPE, m, distance), i, laneGap);
        const deg = (p.heading * 180) / Math.PI;
        return (
          <g key={i} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${deg.toFixed(1)})`}>
            <Horse index={i} bracket={frame[i]} number={i + 1} running={running} leading={i === lead} deg={deg} />
          </g>
        );
      })}

      {/* 語のラベル。回転させると読めないので、位置だけ借りて水平に置く。
          全頭ぶん出すと団子のときに重なって読めないので、上位だけにする */}
      {sorted
        .filter(({ i }) => labelled.has(i))
        .map(({ m, i }) => {
          const p = laneOffset(racePoint(SHAPE, m, distance), i, laneGap);
          return (
            <text
              key={`w${i}`}
              x={p.x}
              y={p.y - 16}
              fontSize={14}
              textAnchor="middle"
              fill="#dbe6ff"
              fontWeight={700}
              stroke="#0b1220"
              strokeWidth={3.5}
              paintOrder="stroke"
            >
              {words[i]}
            </text>
          );
        })}
    </svg>
  );
}
