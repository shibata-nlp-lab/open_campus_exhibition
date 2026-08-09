/**
 * ダウンロード済みモデルの一覧と削除。
 *
 * 体験①②のモデルは userData/models に貯まり、全部そろえると数GBになる。
 * 展示用のノートPCは空きが少ないことが多いので、設定画面から消せるようにする。
 *
 * 置かれ方は 2 通り。
 *   models/<org>/<repo>/…             transformers.js のキャッシュ（Ruri / 体験②のモデル）
 *   models/llm-jp/llm-jp-3-*-embed.bin 体験①の埋め込み層（自前で切り出したもの）
 */
import fs from 'node:fs';
import path from 'node:path';
import { modelsDir } from './localEmbed';
import { llmjpDir } from './llmjpEmbed';
import { RURI_MODELS } from './localEmbed';
import { PREDICT_MODELS } from './predictNext';

export interface StoredModel {
  /** models/ からの相対パス。削除のときにそのまま渡す */
  path: string;
  /** 設定画面に出す名前 */
  label: string;
  /** どの体験で使うか（分からなければ空） */
  usedBy: string;
  bytes: number;
}

/** ディレクトリ以下の合計バイト数（シンボリックリンクは辿らない） */
function sizeOf(target: string): number {
  let total = 0;
  const stack = [target];
  while (stack.length) {
    const p = stack.pop()!;
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      continue; // 途中で消えても数え上げを止めない
    }
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(p)) stack.push(path.join(p, name));
    } else if (st.isFile()) {
      total += st.size;
    }
  }
  return total;
}

/** repo 名から「何に使うモデルか」を引く */
function describe(repo: string): { label: string; usedBy: string } | null {
  for (const m of Object.values(PREDICT_MODELS)) {
    if (m.repo === repo) return { label: m.label, usedBy: '体験②（次の単語の予測）' };
  }
  for (const m of Object.values(RURI_MODELS)) {
    if (m.onnx === repo || m.tokenizer === repo) return { label: m.label, usedBy: '体験①（ベクトル化）' };
  }
  return null;
}

export function listStoredModels(): StoredModel[] {
  const root = modelsDir();
  const out: StoredModel[] = [];
  let orgs: string[];
  try {
    orgs = fs.readdirSync(root);
  } catch {
    return []; // まだ何も落としていない
  }

  for (const org of orgs) {
    const orgPath = path.join(root, org);
    if (!fs.statSync(orgPath).isDirectory()) continue;

    // 体験①の埋め込み層だけは .bin が直接置いてあるので、ファイル単位で並べる
    if (orgPath === llmjpDir()) {
      for (const file of fs.readdirSync(orgPath)) {
        if (!file.endsWith('.bin')) continue;
        out.push({
          path: `${org}/${file}`,
          label: file.replace(/-embed\.bin$/, ' の埋め込み層'),
          usedBy: '体験①（ベクトル化）',
          bytes: sizeOf(path.join(orgPath, file)),
        });
      }
      continue;
    }

    for (const repo of fs.readdirSync(orgPath)) {
      const repoPath = path.join(orgPath, repo);
      if (!fs.statSync(repoPath).isDirectory()) continue;
      const known = describe(`${org}/${repo}`);
      out.push({
        path: `${org}/${repo}`,
        label: known?.label ?? `${org}/${repo}`,
        usedBy: known?.usedBy ?? '',
        bytes: sizeOf(repoPath),
      });
    }
  }
  return out.sort((a, b) => b.bytes - a.bytes);
}

/**
 * 一覧に出したものを消す。
 * パスはレンダラから渡ってくるので、models の外を指していたら必ず断る。
 */
export function deleteStoredModel(rel: string): { bytes: number } {
  const root = modelsDir();
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('models の外は削除できません');
  }
  if (target === root) throw new Error('models そのものは削除できません');
  if (!fs.existsSync(target)) return { bytes: 0 };
  const bytes = sizeOf(target);
  fs.rmSync(target, { recursive: true, force: true });
  return { bytes };
}
