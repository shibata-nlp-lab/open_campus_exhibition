import { describe, it, expect } from 'vitest';
import { PLAY_MODES } from '../src/playModes';

/**
 * 始め方は設定画面のシナリオタブとユーザー権限のランチャーで共通。
 * 片方だけ増える・減るという食い違いを防ぐための確認。
 */
describe('シナリオの始め方', () => {
  it('4つの始め方がそろっている', () => {
    expect(PLAY_MODES.map((m) => m.id)).toEqual(['normal', 'auto', 'muted', 'standby']);
  });

  it('通常はオプションなし（既定の始め方）', () => {
    expect(PLAY_MODES.find((m) => m.id === 'normal')?.opts).toBeUndefined();
  });

  it('通常以外は player:open へ渡す指定を1つだけ持つ', () => {
    for (const m of PLAY_MODES.filter((x) => x.id !== 'normal')) {
      const on = Object.entries(m.opts ?? {}).filter(([, v]) => v === true);
      expect(on).toHaveLength(1);
      expect(on[0][0]).toBe(m.id);
    }
  });

  it('どのボタンにも文字と説明がある', () => {
    for (const m of PLAY_MODES) {
      expect(m.label.trim()).not.toBe('');
      expect(m.panelLabel.trim()).not.toBe('');
      expect(m.hint.trim()).not.toBe('');
    }
  });
});
