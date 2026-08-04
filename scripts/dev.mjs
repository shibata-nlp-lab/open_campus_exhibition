import { createServer } from 'vite';
import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import electronPath from 'electron';
import { mainBuildOptions } from './build.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const server = await createServer({ configFile: resolve(root, 'vite.config.ts') });
await server.listen();
const url = `http://localhost:${server.config.server.port}`;
server.printUrls();

let child = null;
const startElectron = () => {
  if (child) child.kill();
  child = spawn(electronPath, [root], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });
  child.on('close', (code) => {
    if (code !== null) process.exit(code ?? 0);
  });
};

const ctx = await esbuild.context({
  ...mainBuildOptions,
  plugins: [
    {
      name: 'restart-electron',
      setup(b) {
        b.onEnd((r) => {
          if (r.errors.length) return console.error(r.errors);
          startElectron();
        });
      },
    },
  ],
});
await ctx.watch();

process.on('SIGINT', () => {
  child?.kill();
  process.exit(0);
});
