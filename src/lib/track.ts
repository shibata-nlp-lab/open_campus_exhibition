/**
 * 右回りオーバルコースの幾何。
 *
 * 「進んだ距離」を渡すと、その地点の座標と**向き**が返る。向きが連続して変わるので、
 * コーナーではちゃんと回り込んで見える。SVG の座標系（y は下向き）で計算する。
 *
 * ```
 *        第3コーナー ┌───────────┐ 第4コーナー
 *                   │  向正面   │
 *                   └───────────┘
 *        第2コーナー   ゴール前    第1コーナー
 * ```
 *
 * 1周の実距離は競馬場らしく 1600m とし、画面上のオーバルへ縮尺で写す。
 */

export interface TrackShape {
  /** 直線部分の長さ（画面上） */
  straight: number;
  /** コーナーの半径（画面上） */
  radius: number;
  /** 中心 */
  cx: number;
  cy: number;
}

export interface TrackPoint {
  x: number;
  y: number;
  /** 進行方向（ラジアン）。0 が画面右向き */
  heading: number;
}

/** コース1周の実距離（m） */
export const LAP_METERS = 1600;

/** 画面上の1周の長さ */
export const perimeter = (t: TrackShape) => 2 * t.straight + 2 * Math.PI * t.radius;

/**
 * 画面上の距離（0..周長）を座標に変換する。
 *
 * 右回りなので、ゴール前直線を**左向き**に走って第1コーナーへ入る……とすると
 * 見づらいので、画面手前（下側）の直線を右から左へ、上側を左から右へ走る形にする。
 * 0 の地点がゴール板で、そこから時計回りに測る。
 */
export function pointAt(t: TrackShape, d: number): TrackPoint {
  const P = perimeter(t);
  let s = ((d % P) + P) % P;
  const half = t.straight;
  const arc = Math.PI * t.radius;
  const left = t.cx - half / 2;
  const right = t.cx + half / 2;
  const bottom = t.cy + t.radius;
  const top = t.cy - t.radius;

  // 1) 手前の直線：右 → 左
  if (s < half) return { x: right - s, y: bottom, heading: Math.PI };
  s -= half;

  // 2) 第1・2コーナー（画面左）：下 → 上を半円で回る
  if (s < arc) {
    const a = Math.PI / 2 + s / t.radius; // 下（+y）から反時計回り
    return {
      x: left + Math.cos(a) * t.radius,
      y: t.cy + Math.sin(a) * t.radius,
      heading: a + Math.PI / 2,
    };
  }
  s -= arc;

  // 3) 向正面：左 → 右
  if (s < half) return { x: left + s, y: top, heading: 0 };
  s -= half;

  // 4) 第3・4コーナー（画面右）：上 → 下
  const a = -Math.PI / 2 + s / t.radius;
  return {
    x: right + Math.cos(a) * t.radius,
    y: t.cy + Math.sin(a) * t.radius,
    heading: a + Math.PI / 2,
  };
}

/**
 * レース距離ぶん走ったときの位置。
 *
 * ゴールが必ずゴール板（画面上の距離 0）に来るよう、**逆算してスタート地点を決める**。
 * 実距離 → 画面上の距離はコース1周ぶんで正規化する。
 */
export function racePoint(t: TrackShape, meters: number, raceMeters: number): TrackPoint {
  const P = perimeter(t);
  const scale = P / LAP_METERS; // 実距離1m あたりの画面上の長さ
  const start = -raceMeters * scale; // ここから走り始めるとゴールが 0 になる
  return pointAt(t, start + meters * scale);
}

/**
 * 内ラチからレーン番号ぶん外へずらした位置（枠順の見た目を作る）。
 * 右回りなので、進行方向の**左手側**が外側になる。
 */
export function laneOffset(p: TrackPoint, lane: number, gap: number): TrackPoint {
  const nx = Math.cos(p.heading - Math.PI / 2);
  const ny = Math.sin(p.heading - Math.PI / 2);
  return { x: p.x + nx * lane * gap, y: p.y + ny * lane * gap, heading: p.heading };
}

/** 何周するか（表示用） */
export const laps = (raceMeters: number) => raceMeters / LAP_METERS;
