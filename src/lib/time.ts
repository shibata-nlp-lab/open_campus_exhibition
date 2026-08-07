/** 待機画面の「次の回のはじまり」表示に使う時刻計算 */

/**
 * HH:MM までの残り分数。
 * 形式が不正なとき、および時刻を過ぎているときは null を返す
 * （過ぎた時刻を「あと -5 分」と出さないため）。
 */
export function minutesUntil(hhmm: string, now: Date): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const target = new Date(now);
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 60000);
  return diff >= 0 ? diff : null;
}
