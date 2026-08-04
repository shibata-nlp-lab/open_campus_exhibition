import type { OcApi } from '../../electron/preload';

declare global {
  interface Window {
    api: OcApi;
  }
}

export const api = window.api;

export const assetUrl = (rel: string | null | undefined) => (rel ? window.api.asset.url(rel) : '');

export function errText(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  // Electron の IPC は "Error invoking remote method '...': Error: 本文" 形式で返す
  return msg.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '');
}
