import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppConfig } from '../types';
import { api } from '../lib/api';

/** config.json を読み込み、変更を自動保存する（500ms デバウンス） */
export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const skipNextSave = useRef(true);

  useEffect(() => {
    api.config.load().then((c) => {
      skipNextSave.current = true;
      setConfig(c);
    });
  }, []);

  useEffect(() => {
    if (!config) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api.config.save(config).then(() => setSavedAt(Date.now()));
    }, 500);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [config]);

  const update = useCallback((fn: (draft: AppConfig) => AppConfig) => {
    setConfig((prev) => (prev ? fn(structuredClone(prev)) : prev));
  }, []);

  /** 保存を待ってから実行したいとき用 */
  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (config) await api.config.save(config);
  }, [config]);

  return { config, update, savedAt, flush };
}
