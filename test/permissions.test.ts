import { describe, expect, it } from 'vitest';
import type { Role } from '../src/types';
import { ROLE_RANK } from '../src/types';
import {
  assignableRoles,
  canEditContent,
  canManageUser,
  canOpenSettings,
  canOpenTab,
  isValidPin,
  type SettingsTab,
} from '../src/permissions';

const ROLES: Role[] = ['owner', 'admin', 'editor', 'user'];
const TABS: SettingsTab[] = ['scenario', 'content', 'cues', 'general', 'api', 'results', 'users'];

describe('タブのアクセス', () => {
  it('オーナーはすべてのタブを開ける', () => {
    for (const t of TABS) expect(canOpenTab('owner', t)).toBe(true);
  });

  it('アドミニストレーターは API だけ開けない', () => {
    expect(canOpenTab('admin', 'api')).toBe(false);
    for (const t of TABS.filter((t) => t !== 'api')) expect(canOpenTab('admin', t)).toBe(true);
  });

  it('エディターはシナリオとコンテンツだけ', () => {
    expect(canOpenTab('editor', 'scenario')).toBe(true);
    expect(canOpenTab('editor', 'content')).toBe(true);
    // ポン出しは当日の進行で使うので、展示を作る人（editor）も触れる
    expect(canOpenTab('editor', 'cues')).toBe(true);
    for (const t of ['general', 'api', 'results', 'users'] as SettingsTab[]) {
      expect(canOpenTab('editor', t)).toBe(false);
    }
  });

  it('ユーザーはどのタブも開けない（実行のみ）', () => {
    for (const t of TABS) expect(canOpenTab('user', t)).toBe(false);
    expect(canOpenSettings('user')).toBe(false);
  });

  it('ユーザー以外は管理画面を開ける', () => {
    for (const r of ['owner', 'admin', 'editor'] as Role[]) expect(canOpenSettings(r)).toBe(true);
  });

  it('APIキーのタブはオーナー専用', () => {
    for (const r of ROLES.filter((r) => r !== 'owner')) expect(canOpenTab(r, 'api')).toBe(false);
  });
});

describe('ユーザーの管理', () => {
  it('オーナーは自分以外の誰でも操作できる', () => {
    for (const r of ROLES) expect(canManageUser('owner', r, false)).toBe(true);
  });

  it('自分自身は操作できない（権限を下げて詰むのを防ぐ）', () => {
    for (const r of ROLES) expect(canManageUser(r, r, true)).toBe(false);
  });

  it('アドミニストレーターは下位（エディター / ユーザー）だけ', () => {
    expect(canManageUser('admin', 'editor', false)).toBe(true);
    expect(canManageUser('admin', 'user', false)).toBe(true);
    expect(canManageUser('admin', 'admin', false)).toBe(false);
    expect(canManageUser('admin', 'owner', false)).toBe(false);
  });

  it('エディターとユーザーは誰も操作できない', () => {
    for (const actor of ['editor', 'user'] as Role[]) {
      for (const target of ROLES) expect(canManageUser(actor, target, false)).toBe(false);
    }
  });

  it('付与できる権限は自分の権限を超えない', () => {
    expect(assignableRoles('owner')).toEqual(['owner', 'admin', 'editor', 'user']);
    expect(assignableRoles('admin')).toEqual(['editor', 'user']);
    expect(assignableRoles('editor')).toEqual([]);
    expect(assignableRoles('user')).toEqual([]);
    for (const actor of ROLES) {
      for (const r of assignableRoles(actor)) expect(ROLE_RANK[r]).toBeLessThanOrEqual(ROLE_RANK[actor]);
    }
  });
});

describe('コンテンツの編集', () => {
  it('エディター以上は編集できる', () => {
    for (const r of ['owner', 'admin', 'editor'] as Role[]) expect(canEditContent(r)).toBe(true);
  });

  it('ユーザーは編集できない', () => {
    expect(canEditContent('user')).toBe(false);
  });
});

describe('PIN の形式', () => {
  it.each(['1234', '000000', '12345678'])('%o は有効', (p) => {
    expect(isValidPin(p)).toBe(true);
  });

  it.each(['123', '123456789', '', 'abcd', '12 34', '1234a', '１２３４'])('%o は無効', (p) => {
    expect(isValidPin(p)).toBe(false);
  });
});
