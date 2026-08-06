import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppConfig, Content, ResultRecord, StandbyContent } from '../types';
import { api } from '../lib/api';
import VideoStep from './VideoStep';
import SlideStep from './SlideStep';
import QuizStep from './QuizStep';
import Interactive1Step from './Interactive1Step';
import Interactive2Step from './Interactive2Step';
import GameStep from './GameStep';
import SurveyStep from './SurveyStep';
import StandbyStep, { StandbyView } from './StandbyStep';

export interface StepProps<T extends Content = Content> {
  content: T;
  config: AppConfig;
  /** 次のコンテンツへ */
  onFinish: () => void;
  /** 結果ログを記録 */
  record: (kind: ResultRecord['kind'], payload: unknown) => void;
  /** コントローラに出すコンテンツ内部の進捗（任意） */
  onDetail?: (detail: string | null) => void;
  /** 何回目の表示か（やり直し時に内部状態をリセットするため） */
  runKey: number;
}

export default function PlayerApp({ scenarioId }: { scenarioId: string | null }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [index, setIndex] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const [standby, setStandby] = useState(false);
  const [standbyMuted, setStandbyMuted] = useState(false);
  /** コントローラ画面が開いているか。開いていれば来場者側に操作ボタンは出さない */
  const [hasController, setHasController] = useState(false);

  useEffect(() => {
    api.config.load().then(setConfig);
    return api.config.onChanged(setConfig);
  }, []);

  useEffect(() => {
    api.controller.exists().then(setHasController);
    return api.controller.onPresence(setHasController);
  }, []);

  const scenario = useMemo(() => {
    if (!config) return null;
    return (
      config.scenarios.find((s) => s.id === scenarioId) ??
      config.scenarios.find((s) => s.id === config.activeScenarioId) ??
      config.scenarios[0] ??
      null
    );
  }, [config, scenarioId]);

  const steps = useMemo(() => {
    if (!config || !scenario) return [] as Content[];
    return scenario.steps
      .filter((s) => s.enabled)
      .map((s) => config.contents.find((c) => c.id === s.contentId))
      .filter((c): c is Content => Boolean(c));
  }, [config, scenario]);

  const goto = useCallback(
    (i: number) => {
      setIndex((prev) => {
        const next = Math.max(0, Math.min(steps.length - 1, i));
        if (next !== prev) {
          setRunKey((k) => k + 1);
          setDetail(null);
        }
        return next;
      });
    },
    [steps.length]
  );

  const next = useCallback(() => goto(index + 1), [goto, index]);
  const prev = useCallback(() => goto(index - 1), [goto, index]);
  const restart = useCallback(() => {
    setIndex(0);
    setRunKey((k) => k + 1);
    setDetail(null);
  }, []);

  /* キーボード操作 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (e.key === 'Escape') return void api.player.close();
      if (typing) return;
      const k = e.key.toLowerCase();
      if (k === 'n') next();
      else if (k === 'p') prev();
      else if (k === 'f') api.player.toggleFullscreen();
      else if (k === 'r') restart();
      else if (k === 's') setStandby((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, restart]);

  /* コントローラからの操作 */
  useEffect(() => {
    return api.playback.onCommand((cmd) => {
      if (cmd.type === 'next') next();
      else if (cmd.type === 'prev') prev();
      else if (cmd.type === 'goto') goto(cmd.index);
      else if (cmd.type === 'restart') restart();
      else if (cmd.type === 'standby') setStandby((v) => cmd.on ?? !v);
      else if (cmd.type === 'standbyMute') setStandbyMuted((v) => cmd.muted ?? !v);
      else if (cmd.type === 'advance' || cmd.type === 'back') {
        // 表示中のコンテンツ側のキー処理（useStepKeys）にそのまま流す
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: cmd.type === 'advance' ? 'ArrowRight' : 'ArrowLeft' })
        );
      }
    });
  }, [next, prev, goto, restart]);

  /**
   * オーバーレイ用の待機画面。
   * シナリオ内に待機コンテンツがあればその設定（BGM含む）を流用し、なければ既定の文言を使う。
   */
  const overlayStandby: StandbyContent = useMemo(
    () =>
      (config?.contents.find((c) => c.type === 'standby') as StandbyContent | undefined) ?? {
        id: 'standby_default',
        type: 'standby',
        name: '待機画面',
        message: 'しばらくお待ちください',
        submessage: 'まもなく再開します',
        showClock: true,
        nextStartMode: 'hidden',
        nextStartTime: '',
        autoAdvanceSec: 0,
        audio: { src: null, volume: 0.6, loop: true },
      },
    [config]
  );

  /** いま待機画面のBGMを操作できる状態か */
  const currentContent = steps[index];
  const standbyAudioAvailable =
    currentContent?.type === 'standby'
      ? Boolean((currentContent as StandbyContent).audio?.src)
      : standby && Boolean(overlayStandby.audio?.src);

  /** コントローラで開始時刻を編集する対象（表示中の待機画面 → なければオーバーレイ用） */
  const effectiveStandby =
    currentContent?.type === 'standby' ? (currentContent as StandbyContent) : overlayStandby;

  /* コントローラへ状態を配信 */
  const publishedRef = useRef('');
  useEffect(() => {
    if (!scenario) return;
    const state = {
      scenarioName: scenario.name,
      index,
      total: steps.length,
      // メモは進行画面（来場者側）には出さず、コントローラにだけ送る
      steps: steps.map((c) => ({ id: c.id, name: c.name, type: c.type, note: c.note })),
      detail,
      standby,
      standbyAudio: { available: standbyAudioAvailable, muted: standbyMuted },
      standbyNext: {
        contentId: effectiveStandby.id,
        mode: effectiveStandby.nextStartMode ?? 'hidden',
        time: effectiveStandby.nextStartTime ?? '',
      },
    };
    const json = JSON.stringify(state);
    if (json === publishedRef.current) return;
    publishedRef.current = json;
    api.playback.publish(state);
  }, [scenario, index, steps, detail, standby, standbyAudioAvailable, standbyMuted, effectiveStandby]);

  if (!config) return <div className="player" />;

  if (!scenario || steps.length === 0) {
    return (
      <div className="player">
        <div className="stage">
          <h1>シナリオが空です</h1>
          <p className="lead">設定画面でコンテンツを追加し、有効にしてください。</p>
          <button className="btn lg" onClick={() => api.player.close()}>閉じる（Esc）</button>
        </div>
      </div>
    );
  }

  const content = steps[index];
  const isLast = index === steps.length - 1;

  const stepProps: StepProps = {
    content,
    config,
    onFinish: () => (isLast ? restart() : next()),
    record: (kind, payload) => {
      api.results.append({
        ts: new Date().toISOString(),
        scenarioId: scenario.id,
        contentId: content.id,
        kind,
        payload,
      });
    },
    onDetail: setDetail,
    runKey,
  };

  const body = (() => {
    switch (content.type) {
      case 'video': return <VideoStep {...(stepProps as StepProps<typeof content>)} />;
      case 'slide': return <SlideStep {...(stepProps as StepProps<typeof content>)} />;
      case 'quiz': return <QuizStep {...(stepProps as StepProps<typeof content>)} />;
      case 'interactive1': return <Interactive1Step {...(stepProps as StepProps<typeof content>)} />;
      case 'interactive2': return <Interactive2Step {...(stepProps as StepProps<typeof content>)} />;
      case 'game': return <GameStep {...(stepProps as StepProps<typeof content>)} />;
      case 'survey': return <SurveyStep {...(stepProps as StepProps<typeof content>)} />;
      case 'standby':
        return <StandbyStep {...(stepProps as StepProps<typeof content>)} standbyMuted={standbyMuted} />;
    }
  })();

  return (
    <div className="player">
      <div className="player-body" key={`${content.id}_${runKey}`}>
        {body}
      </div>
      {standby && content.type !== 'standby' && (
        <StandbyView content={overlayStandby} overlay muted={standbyMuted} onFinish={() => setStandby(false)} />
      )}
      <div className="player-bar">
        <span className="title">{config.settings.exhibitTitle}</span>
        <div className="progress-dots">
          {steps.map((_, i) => (
            <i key={i} className={i < index ? 'done' : i === index ? 'current' : ''} />
          ))}
        </div>
        <span className="small muted">
          {index + 1} / {steps.length}
        </span>
        <div className="spacer" />
        {/* コントローラで操作できるときは、来場者に見える送り／戻しボタンは出さない */}
        {!hasController && (
          <>
            <button className="btn sm ghost" onClick={prev} disabled={index === 0}>◀</button>
            <button className="btn sm ghost" onClick={next} disabled={isLast}>▶</button>
          </>
        )}
      </div>
    </div>
  );
}
