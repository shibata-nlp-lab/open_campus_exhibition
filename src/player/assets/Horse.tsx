/**
 * 馬の SVG（**真上から見た図**）。外部画像を持たないので、オフラインでもビルド成果物だけで動く。
 *
 * 原点は馬の重心、鼻先が +x（heading 0 ＝ 画面右）を向いている。
 * 呼び出し側が `rotate(heading)` するだけで進行方向を向く。
 * 横から見た絵にすると、コースの向こう正面で上下が逆さになってしまうので真上から描いている。
 *
 * 脚と尾は CSS アニメーションで動かす（`prefers-reduced-motion` では止まる）。
 */

/** JRA の枠色。1..8 */
export const BRACKET_COLORS: Record<number, { bg: string; fg: string }> = {
  1: { bg: '#ffffff', fg: '#111111' },
  2: { bg: '#1a1a1a', fg: '#ffffff' },
  3: { bg: '#e0334a', fg: '#ffffff' },
  4: { bg: '#2f6fd0', fg: '#ffffff' },
  5: { bg: '#f2d235', fg: '#111111' },
  6: { bg: '#3aa85a', fg: '#ffffff' },
  7: { bg: '#f08a24', fg: '#111111' },
  8: { bg: '#f09ec0', fg: '#111111' },
};

/** 馬体の色。番号で散らす */
const COATS = ['#6b4f39', '#3d2b1f', '#8a6b4b', '#2e2a28', '#a08762', '#4a3a2c'];

export interface HorseProps {
  /** 0始まりの馬番。馬体色と脚の位相をずらすのに使う */
  index: number;
  /** 枠番 1..8 */
  bracket: number;
  /** 表示する番号（1始まり） */
  number: number;
  /** 走っているか。false なら脚を止める */
  running?: boolean;
  /** 先頭の馬を目立たせる */
  leading?: boolean;
  /** 呼び出し側が掛けている回転（度）。馬番だけ水平に戻すために使う */
  deg?: number;
}

export default function Horse({ index, bracket, number, running = true, leading = false, deg = 0 }: HorseProps) {
  const coat = COATS[index % COATS.length];
  const silk = BRACKET_COLORS[bracket] ?? BRACKET_COLORS[1];
  // 脚の運びをずらして、全頭が同じ動きに見えないようにする
  const delay = `${-(index % 7) * 0.07}s`;

  return (
    <g className={running ? 'horse running' : 'horse'} style={{ ['--gait-delay' as string]: delay }}>
      {leading && <circle cx={0} cy={0} r={17} fill="#ffd76a" opacity={0.22} />}

      {/* 尾 */}
      <path className="tail" d="M-12 0 q-6 0 -9 2" stroke={coat} strokeWidth={2.4} fill="none" strokeLinecap="round" />

      {/* 後脚（左右） */}
      <g className="leg hind">
        <path d="M-6 -4 L-10 -8" stroke={coat} strokeWidth={2.4} strokeLinecap="round" />
        <path d="M-6 4 L-10 8" stroke={coat} strokeWidth={2.4} strokeLinecap="round" />
      </g>
      {/* 前脚（左右） */}
      <g className="leg fore">
        <path d="M6 -4 L10 -8" stroke={coat} strokeWidth={2.4} strokeLinecap="round" />
        <path d="M6 4 L10 8" stroke={coat} strokeWidth={2.4} strokeLinecap="round" />
      </g>

      {/* 胴（進行方向が長軸） */}
      <ellipse cx={0} cy={0} rx={12} ry={5.5} fill={coat} />
      {/* 首 */}
      <path d="M9 -3 L16 -1.6 L16 1.6 L9 3 Z" fill={coat} />
      {/* 頭 */}
      <ellipse cx={17.5} cy={0} rx={3.6} ry={2.4} fill={coat} />
      {/* 耳 */}
      <path d="M15.5 -2 l1 -2 l1 1.6" fill={coat} />
      <path d="M15.5 2 l1 2 l1 -1.6" fill={coat} />

      {/* 騎手。勝負服は枠色、上に馬番。番号は回転を戻して常に水平にする */}
      <circle cx={-1} cy={0} r={5} fill={silk.bg} stroke="#00000066" strokeWidth={0.7} />
      <g transform={`translate(-1 0) rotate(${-deg})`}>
        <text
          x={0}
          y={1.8}
          fontSize={5.4}
          textAnchor="middle"
          fill={silk.fg}
          fontWeight={700}
          style={{ pointerEvents: 'none' }}
        >
          {number}
        </text>
      </g>
    </g>
  );
}
