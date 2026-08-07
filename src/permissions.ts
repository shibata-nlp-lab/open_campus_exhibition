/**
 * 役割ごとにできることの表。main と renderer の両方から参照する。
 *
 * これは「うっかり触らせない」ための仕切りであって、セキュリティ機構ではない。
 * config.json も users.json も同じPCの中にあり、ファイルを直接編集すれば誰でも変えられる。
 * 展示当日に展示員が設定を触って壊す・APIキーを見てしまう、といった事故を防ぐ目的。
 */
import { ROLE_RANK, type Role } from './types';

/** 設定画面のタブ */
export type SettingsTab = 'scenario' | 'content' | 'general' | 'api' | 'results' | 'users';

const TAB_ALLOW: Record<SettingsTab, Role[]> = {
  scenario: ['owner', 'admin', 'editor'],
  content: ['owner', 'admin', 'editor'],
  general: ['owner', 'admin'],
  api: ['owner'], // APIキーを扱うのでオーナーだけ
  results: ['owner', 'admin'],
  users: ['owner', 'admin'], // admin は下位ユーザーのみ操作できる（下の canManage 参照）
};

export const canOpenTab = (role: Role, tab: SettingsTab) => TAB_ALLOW[tab].includes(role);

/** 管理画面を開けるか（1つでもタブがあるか）。user は実行のみなので開けない */
export const canOpenSettings = (role: Role) =>
  (Object.keys(TAB_ALLOW) as SettingsTab[]).some((t) => canOpenTab(role, t));

/**
 * actor が target の権限を変更・削除できるか。
 * owner は誰でも。admin は自分より下位だけ。それ以外は不可。
 * 自分自身は変更できない（自分の権限を下げて誰も管理できなくなるのを防ぐ）。
 */
export function canManageUser(actor: Role, target: Role, isSelf: boolean): boolean {
  if (isSelf) return false;
  if (actor === 'owner') return true;
  if (actor === 'admin') return ROLE_RANK[target] < ROLE_RANK.admin;
  return false;
}

/** actor が付与できる役割の一覧 */
export function assignableRoles(actor: Role): Role[] {
  if (actor === 'owner') return ['owner', 'admin', 'editor', 'user'];
  if (actor === 'admin') return ['editor', 'user'];
  return [];
}

/** シナリオやコンテンツを編集できるか（user は実行のみ） */
export const canEditContent = (role: Role) => ROLE_RANK[role] >= ROLE_RANK.editor;

/** PIN の形式。展示中に素早く入れられるよう数字のみ */
export const PIN_PATTERN = /^\d{4,8}$/;
export const isValidPin = (pin: string) => PIN_PATTERN.test(pin);
