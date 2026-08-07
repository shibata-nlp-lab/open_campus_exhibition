/**
 * 展示員ユーザーと PIN の管理。
 *
 * - PIN は scrypt でハッシュ化して userData/users.json に置く。生の PIN は保存しない
 * - ハッシュはメインプロセスから外に出さない（レンダラに渡すのは id / name / role だけ）
 * - ユーザーが 1 人も居なければ認証そのものを使わない（初期状態＝これまでどおり誰でも触れる）
 *
 * ファイルを消せば認証は無効に戻る。パスワードを忘れたときの回避策でもあり、
 * 同時に「これはセキュリティ機構ではない」ということでもある（[permissions.ts] のコメント参照）。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { userDir } from './config';
import { ROLE_RANK, type Role, type UserInfo } from '../src/types';
import { canManageUser, isValidPin } from '../src/permissions';

interface StoredUser {
  id: string;
  name: string;
  role: Role;
  salt: string;
  hash: string;
}

export const usersPath = () => path.join(userDir(), 'users.json');

const KEYLEN = 32;

function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, KEYLEN).toString('hex');
}

/** タイミング差で PIN を推測されないように固定時間で比べる */
function sameHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function readUsers(): StoredUser[] {
  try {
    const rows = JSON.parse(fs.readFileSync(usersPath(), 'utf-8')) as StoredUser[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeUsers(rows: StoredUser[]) {
  const tmp = usersPath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), 'utf-8');
  fs.renameSync(tmp, usersPath());
}

const publicOf = (u: StoredUser): UserInfo => ({ id: u.id, name: u.name, role: u.role });

/* ---------------- セッション ---------------- */

let current: UserInfo | null = null;

/** ユーザーが登録されていれば認証を使う */
export const authEnabled = () => readUsers().length > 0;

export function authState() {
  return { enabled: authEnabled(), current };
}

/**
 * 現在の実効ロール。
 * 認証を使っていない状態では owner 扱いにする（初期状態で何も触れないと詰むため）。
 */
export function effectiveRole(): Role {
  if (!authEnabled()) return 'owner';
  return current?.role ?? 'user';
}

export function login(id: string, pin: string): UserInfo {
  const u = readUsers().find((x) => x.id === id);
  // 存在しない ID でも同じだけ時間を使い、同じ文言を返す（どの ID があるか探らせない）
  const ok = u ? sameHash(hashPin(pin, u.salt), u.hash) : hashPin(pin, 'dummy') === '';
  if (!u || !ok) throw new Error('PIN が違います。');
  current = publicOf(u);
  return current;
}

export function logout() {
  current = null;
}

export function listUsers(): UserInfo[] {
  return readUsers()
    .map(publicOf)
    .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.name.localeCompare(b.name, 'ja'));
}

/* ---------------- 追加・変更・削除 ---------------- */

function assertCanManage(targetId: string) {
  const rows = readUsers();
  const target = rows.find((x) => x.id === targetId);
  if (!target) throw new Error('ユーザーが見つかりません。');
  if (!canManageUser(effectiveRole(), target.role, current?.id === targetId)) {
    throw new Error(
      current?.id === targetId ? '自分自身の権限は変更できません。' : 'このユーザーを操作する権限がありません。'
    );
  }
  return { rows, target };
}

/**
 * ユーザーを追加する。
 * 1人目は必ずオーナーになる（誰も管理できない状態を作らないため）。
 */
export function addUser(name: string, pin: string, role: Role): UserInfo {
  const rows = readUsers();
  const first = rows.length === 0;
  if (!first && effectiveRole() !== 'owner' && effectiveRole() !== 'admin') {
    throw new Error('ユーザーを追加する権限がありません。');
  }
  if (!first && effectiveRole() === 'admin' && ROLE_RANK[role] >= ROLE_RANK.admin) {
    throw new Error('アドミニストレーター以上は追加できません。');
  }
  if (!name.trim()) throw new Error('名前を入力してください。');
  if (!isValidPin(pin)) throw new Error('PIN は 4〜8 桁の数字で入力してください。');
  if (rows.some((x) => x.name === name.trim())) throw new Error('同じ名前のユーザーがすでにいます。');

  const salt = crypto.randomBytes(16).toString('hex');
  const u: StoredUser = {
    id: `u_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
    name: name.trim(),
    role: first ? 'owner' : role,
    salt,
    hash: hashPin(pin, salt),
  };
  writeUsers([...rows, u]);
  // 1人目を作った直後は、そのままログインした状態にする（作った本人が締め出されないように）
  if (first) current = publicOf(u);
  return publicOf(u);
}

export function setRole(targetId: string, role: Role): UserInfo {
  const { rows, target } = assertCanManage(targetId);
  if (effectiveRole() === 'admin' && ROLE_RANK[role] >= ROLE_RANK.admin) {
    throw new Error('アドミニストレーター以上には変更できません。');
  }
  // 最後のオーナーを降格させると誰も管理できなくなる
  if (target.role === 'owner' && rows.filter((x) => x.role === 'owner').length === 1 && role !== 'owner') {
    throw new Error('オーナーが居なくなるため変更できません。先に別のオーナーを作ってください。');
  }
  target.role = role;
  writeUsers(rows);
  return publicOf(target);
}

export function setPin(targetId: string, pin: string) {
  // 自分の PIN は自分で変えられる。他人のものは管理権限が要る
  if (current?.id !== targetId) assertCanManage(targetId);
  if (!isValidPin(pin)) throw new Error('PIN は 4〜8 桁の数字で入力してください。');
  const rows = readUsers();
  const target = rows.find((x) => x.id === targetId);
  if (!target) throw new Error('ユーザーが見つかりません。');
  target.salt = crypto.randomBytes(16).toString('hex');
  target.hash = hashPin(pin, target.salt);
  writeUsers(rows);
  return true;
}

export function removeUser(targetId: string) {
  const { rows, target } = assertCanManage(targetId);
  if (target.role === 'owner' && rows.filter((x) => x.role === 'owner').length === 1) {
    throw new Error('最後のオーナーは削除できません。');
  }
  writeUsers(rows.filter((x) => x.id !== targetId));
  return true;
}
