import { build as viteBuild } from 'vite';
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const mainBuildOptions = {
  entryPoints: [resolve(root, 'electron/main.ts'), resolve(root, 'electron/preload.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outdir: resolve(root, 'dist/main'),
  // ネイティブバイナリを含むので束ねずに node_modules から読ませる
  external: ['electron', '@huggingface/transformers', 'onnxruntime-node', 'sharp'],
  sourcemap: true,
};

async function run() {
  await esbuild.build({ ...mainBuildOptions, define: { 'process.env.VITE_DEV_SERVER_URL': 'undefined' } });
  await viteBuild({ configFile: resolve(root, 'vite.config.ts') });
  console.log('build done');
}

if (import.meta.url === `file://${process.argv[1]}`) run();
