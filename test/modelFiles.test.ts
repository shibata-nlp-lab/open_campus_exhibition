import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// modelsDir() は app.getPath('userData') 由来なので、一時ディレクトリに差し替える
const tmp = path.join(os.tmpdir(), 'oc-models-' + Math.random().toString(36).slice(2));
vi.mock('electron', () => ({ app: { getPath: () => tmp } }));

const { listStoredModels, deleteStoredModel } = await import('../electron/modelFiles');

const models = path.join(tmp, 'models');
const write = (rel: string, bytes: number) => {
  const p = path.join(models, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.alloc(bytes));
};

beforeEach(() => {
  fs.rmSync(models, { recursive: true, force: true });
  fs.mkdirSync(models, { recursive: true });
});

describe('listStoredModels', () => {
  it('何も無ければ空（初回起動で落ちない）', () => {
    fs.rmSync(models, { recursive: true, force: true });
    expect(listStoredModels()).toEqual([]);
  });

  it('org/repo ごとに1行にまとめ、中のファイルを合計する', () => {
    write('junhongwang/llm-jp-3-980m-instruct3/onnx/model_quantized.onnx', 1000);
    write('junhongwang/llm-jp-3-980m-instruct3/tokenizer.json', 500);
    const rows = listStoredModels();
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe('junhongwang/llm-jp-3-980m-instruct3');
    expect(rows[0].bytes).toBe(1500);
  });

  it('知っている repo には用途と分かりやすい名前が付く', () => {
    write('junhongwang/llm-jp-3-980m-instruct3/onnx/model_quantized.onnx', 10);
    const [row] = listStoredModels();
    expect(row.label).toContain('llm-jp-3-980m');
    expect(row.usedBy).toContain('体験②');
  });

  it('知らない repo でもパスをそのまま出す（消せなくならないように）', () => {
    write('someone/unknown-model/onnx/model.onnx', 10);
    const [row] = listStoredModels();
    expect(row.label).toBe('someone/unknown-model');
    expect(row.usedBy).toBe('');
  });

  it('体験①の埋め込み層は .bin ファイル単位で並べる', () => {
    write('llm-jp/llm-jp-3-150m-embed.bin', 300);
    write('llm-jp/llm-jp-3-1.8b-embed.bin', 900);
    const rows = listStoredModels();
    expect(new Set(rows.map((r) => r.path))).toEqual(
      new Set(['llm-jp/llm-jp-3-150m-embed.bin', 'llm-jp/llm-jp-3-1.8b-embed.bin'])
    );
    for (const r of rows) expect(r.usedBy).toContain('体験①');
  });

  it('大きい順に並ぶ（消したいものが上に来る）', () => {
    write('a/small/f', 10);
    write('b/big/f', 999);
    expect(listStoredModels().map((r) => r.path)).toEqual(['b/big', 'a/small']);
  });
});

describe('deleteStoredModel', () => {
  it('フォルダごと消して、消した分のバイト数を返す', () => {
    write('junhongwang/llm-jp-3-980m-instruct3/onnx/model_quantized.onnx', 1000);
    write('junhongwang/llm-jp-3-980m-instruct3/tokenizer.json', 24);
    expect(deleteStoredModel('junhongwang/llm-jp-3-980m-instruct3')).toEqual({ bytes: 1024 });
    expect(listStoredModels()).toEqual([]);
  });

  it('.bin ファイル1つだけを消せる（他のサイズを巻き込まない）', () => {
    write('llm-jp/llm-jp-3-150m-embed.bin', 300);
    write('llm-jp/llm-jp-3-1.8b-embed.bin', 900);
    deleteStoredModel('llm-jp/llm-jp-3-150m-embed.bin');
    expect(listStoredModels().map((r) => r.path)).toEqual(['llm-jp/llm-jp-3-1.8b-embed.bin']);
  });

  it('存在しないものは 0 バイトとして黙って通す（二重クリックで落ちない）', () => {
    expect(deleteStoredModel('nope/nothing')).toEqual({ bytes: 0 });
  });

  it('models の外は消せない — パスはレンダラから来るので必ず断る', () => {
    const outside = path.join(tmp, 'config.json');
    fs.writeFileSync(outside, 'x');
    expect(() => deleteStoredModel('../config.json')).toThrow();
    expect(() => deleteStoredModel('../../etc/hosts')).toThrow();
    expect(() => deleteStoredModel('/etc/hosts')).toThrow();
    expect(fs.existsSync(outside)).toBe(true);
  });

  it('models そのものは消せない', () => {
    expect(() => deleteStoredModel('.')).toThrow();
    expect(fs.existsSync(models)).toBe(true);
  });
});
