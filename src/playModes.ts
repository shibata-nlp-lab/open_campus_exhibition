/**
 * シナリオの始め方。設定画面のシナリオタブと、ユーザー権限のランチャーで同じものを出す。
 *
 * 展示員（ユーザー権限）も当日の状況に合わせて選べる必要があるので、
 * 「編集はできないが、始め方は全部選べる」という切り分けにしている。
 */
export interface PlayMode {
  id: 'normal' | 'auto' | 'muted' | 'standby';
  /** ランチャーのボタン文字 */
  label: string;
  /** シナリオタブのボタン文字（1つのシナリオを開いている画面なので言い回しが違う） */
  panelLabel: string;
  /** マウスを乗せたときの説明 */
  hint: string;
  opts?: { auto?: boolean; muted?: boolean; standby?: boolean };
}

export const PLAY_MODES: PlayMode[] = [
  {
    id: 'normal',
    label: '▶ 開始',
    panelLabel: '▶ このシナリオで開始',
    hint: '最初の画面から始めます。進行はコントローラで行います',
  },
  {
    id: 'auto',
    label: '⏩ 自動',
    panelLabel: '⏩ 自動モードで開始',
    hint: '音声を流し、設定した待ち時間で自動的に次の画面へ進みます。人が操作しない展示用（A キーで解除できます）',
    opts: { auto: true },
  },
  {
    id: 'muted',
    label: '🔇 音声なし',
    panelLabel: '🔇 音声を止めて開始',
    hint: '音を鳴らさずに開きます。隣で別の説明をしているときの下見用（進行画面で M キーを押せば元に戻せます）',
    opts: { muted: true },
  },
  {
    id: 'standby',
    label: '⏸ 待機画面',
    panelLabel: '⏸ 待機画面で開始',
    hint: '待機画面を出した状態で開きます。本編への切り替えはコントローラから行います',
    opts: { standby: true },
  },
];
