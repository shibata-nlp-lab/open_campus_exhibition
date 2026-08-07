import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tmp = path.join(os.tmpdir(), 'oc-users-' + Math.random().toString(36).slice(2));
vi.mock('electron', () => ({ app: { getPath: () => tmp } }));

const users = await import('../electron/users');

beforeEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  users.logout();
});

const raw = () => JSON.parse(fs.readFileSync(path.join(tmp, 'users.json'), 'utf-8'));

describe('初期状態', () => {
  it('ユーザーが居なければ認証を使わない', () => {
    expect(users.authEnabled()).toBe(false);
    // 誰も居ない状態で何も触れないと詰むので owner 扱いにする
    expect(users.effectiveRole()).toBe('owner');
  });

  it('1人目は指定に関わらずオーナーになる', () => {
    const u = users.addUser('柴田', '1234', 'user');
    expect(u.role).toBe('owner');
    expect(users.authEnabled()).toBe(true);
  });

  it('1人目を作った本人はそのままログイン状態になる', () => {
    users.addUser('柴田', '1234', 'owner');
    expect(users.authState().current?.name).toBe('柴田');
  });
});

describe('PIN の保存', () => {
  it('生の PIN はファイルに残らない', () => {
    users.addUser('柴田', '135790', 'owner');
    const text = fs.readFileSync(path.join(tmp, 'users.json'), 'utf-8');
    expect(text).not.toContain('135790');
    expect(raw()[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(raw()[0].salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it('同じ PIN でもユーザーごとにハッシュが違う（ソルトが別）', () => {
    users.addUser('A', '1234', 'owner');
    users.addUser('B', '1234', 'user');
    const [a, b] = raw();
    expect(a.hash).not.toBe(b.hash);
  });

  it('4桁未満・数字以外は受け付けない', () => {
    expect(() => users.addUser('A', '12', 'owner')).toThrow(/4〜8/);
    expect(() => users.addUser('A', 'abcd', 'owner')).toThrow(/4〜8/);
  });

  it('名前の重複を拒む', () => {
    users.addUser('柴田', '1234', 'owner');
    expect(() => users.addUser('柴田', '5678', 'user')).toThrow(/すでに/);
  });
});

describe('ログイン', () => {
  it('正しい PIN で通る', () => {
    const u = users.addUser('柴田', '1234', 'owner');
    users.logout();
    expect(users.login(u.id, '1234').name).toBe('柴田');
  });

  it('違う PIN は通らない', () => {
    const u = users.addUser('柴田', '1234', 'owner');
    users.logout();
    expect(() => users.login(u.id, '9999')).toThrow(/PIN/);
    expect(users.authState().current).toBeNull();
  });

  it('存在しない ID でも同じ文言を返す（ID を探らせない）', () => {
    users.addUser('柴田', '1234', 'owner');
    users.logout();
    expect(() => users.login('u_nope', '1234')).toThrow('PIN が違います。');
  });

  it('ログアウトすると権限は user に落ちる', () => {
    users.addUser('柴田', '1234', 'owner');
    users.logout();
    expect(users.effectiveRole()).toBe('user');
  });
});

describe('権限の変更', () => {
  it('オーナーは他人の権限を変えられる', () => {
    users.addUser('owner', '1234', 'owner');
    const e = users.addUser('編集', '1234', 'editor');
    expect(users.setRole(e.id, 'admin').role).toBe('admin');
  });

  it('自分自身は変えられない', () => {
    const o = users.addUser('owner', '1234', 'owner');
    expect(() => users.setRole(o.id, 'user')).toThrow(/自分自身/);
  });

  it('最後のオーナーは降格も削除もできない', () => {
    const o = users.addUser('owner', '1234', 'owner');
    const other = users.addUser('編集', '1234', 'editor');
    users.login(other.id, '1234'); // editor には権限が無い
    expect(() => users.setRole(o.id, 'user')).toThrow();
    expect(() => users.removeUser(o.id)).toThrow();
  });

  it('アドミニストレーターは上位を作れない', () => {
    users.addUser('owner', '1234', 'owner');
    const a = users.addUser('管理', '1234', 'admin');
    users.login(a.id, '1234');
    expect(() => users.addUser('別管理', '1234', 'admin')).toThrow(/以上は追加/);
    expect(users.addUser('編集', '1234', 'editor').role).toBe('editor');
  });

  it('アドミニストレーターはオーナーを操作できない', () => {
    const o = users.addUser('owner', '1234', 'owner');
    const a = users.addUser('管理', '1234', 'admin');
    users.login(a.id, '1234');
    expect(() => users.setRole(o.id, 'user')).toThrow(/権限がありません/);
    expect(() => users.removeUser(o.id)).toThrow(/権限がありません/);
  });

  it('エディターは誰も操作できない', () => {
    users.addUser('owner', '1234', 'owner');
    const e = users.addUser('編集', '1234', 'editor');
    const u = users.addUser('展示員', '1234', 'user');
    users.login(e.id, '1234');
    expect(() => users.setRole(u.id, 'admin')).toThrow();
    expect(() => users.addUser('新規', '1234', 'user')).toThrow(/権限がありません/);
  });
});

describe('PIN の再設定', () => {
  it('自分の PIN は自分で変えられる', () => {
    const o = users.addUser('owner', '1234', 'owner');
    expect(users.setPin(o.id, '5678')).toBe(true);
    users.logout();
    expect(users.login(o.id, '5678').id).toBe(o.id);
  });

  it('オーナーは他人の PIN を再設定できる（忘れたとき用）', () => {
    users.addUser('owner', '1234', 'owner');
    const u = users.addUser('展示員', '1111', 'user');
    users.setPin(u.id, '2222');
    users.logout();
    expect(users.login(u.id, '2222').id).toBe(u.id);
  });

  it('ユーザーは他人の PIN を変えられない', () => {
    users.addUser('owner', '1234', 'owner');
    const a = users.addUser('展示員A', '1111', 'user');
    const b = users.addUser('展示員B', '2222', 'user');
    users.login(a.id, '1111');
    expect(() => users.setPin(b.id, '9999')).toThrow();
  });
});

describe('一覧', () => {
  it('ハッシュもソルトも含めない', () => {
    users.addUser('柴田', '1234', 'owner');
    for (const u of users.listUsers()) {
      expect(Object.keys(u).sort()).toEqual(['id', 'name', 'role']);
    }
  });

  it('権限の強い順に並ぶ', () => {
    users.addUser('owner', '1234', 'owner');
    users.addUser('展示員', '1234', 'user');
    users.addUser('管理', '1234', 'admin');
    expect(users.listUsers().map((u) => u.role)).toEqual(['owner', 'admin', 'user']);
  });
});
