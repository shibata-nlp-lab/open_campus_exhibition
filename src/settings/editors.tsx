import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type {
  AudioSetting,
  BettingContent,
  BettingRace,
  Content,
  GameContent,
  Interactive1Content,
  Interactive2Content,
  QuizContent,
  SlideContent,
  StandbyContent,
  SurveyContent,
  VideoContent,
} from '../types';
import { uid } from '../defaults';
import { api, errText } from '../lib/api';
import { AssetPicker, Field, NumberField, Toggle } from './common';
import { parseRacesCsv } from '../lib/racecsv';
import { raceOdds } from '../lib/odds';
import { buildRaceCurve } from '../lib/race';

type Patch<T> = (fn: (c: T) => void) => void;

/* ---------------- 共通：音声設定 ---------------- */

function AudioFields({
  audio,
  patch,
  alwaysLoop = false,
}: {
  audio: AudioSetting;
  patch: (fn: (a: AudioSetting) => void) => void;
  /** 待機画面のように必ずループさせるものは、トグルを出さず説明だけにする */
  alwaysLoop?: boolean;
}) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="small muted" style={{ marginBottom: 8 }}>この最中に流す音声</div>
      <AssetPicker
        label="音声ファイル"
        value={audio.src}
        filters={[{ name: '音声', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg'] }]}
        onChange={(rel) => patch((a) => void (a.src = rel))}
      />
      <div className="row">
        <div style={{ flex: 1 }}>
          <Field label={`音量 ${(audio.volume * 100) | 0}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.volume}
              onChange={(e) => patch((a) => void (a.volume = Number(e.target.value)))}
            />
          </Field>
        </div>
        {alwaysLoop ? (
          <span className="small muted" style={{ whiteSpace: 'nowrap' }}>ループ再生（常にオン）</span>
        ) : (
          <Toggle label="ループ再生" checked={audio.loop} onChange={(v) => patch((a) => void (a.loop = v))} />
        )}
      </div>
    </div>
  );
}

/* ---------------- 動画 ---------------- */

function VideoEditor({ c, patch }: { c: VideoContent; patch: Patch<VideoContent> }) {
  return (
    <>
      <AssetPicker
        label="動画ファイル"
        value={c.src}
        filters={[{ name: '動画', extensions: ['mp4', 'webm', 'mov', 'm4v'] }]}
        onChange={(rel) => patch((x) => void (x.src = rel))}
        hint="H.264 / VP9 の mp4・webm を推奨。"
      />
      <Toggle label="音声をミュートで開始（進行画面でも切替可）" checked={c.muted} onChange={(v) => patch((x) => void (x.muted = v))} />
      <Toggle label="ループ再生" checked={c.loop} onChange={(v) => patch((x) => void (x.loop = v))} />
      <Toggle label="再生終了で自動的に次へ進む" checked={c.autoAdvance} onChange={(v) => patch((x) => void (x.autoAdvance = v))} />
      {c.src && (
        <video src={api.asset.url(c.src)} controls style={{ width: '100%', maxHeight: 260, borderRadius: 10, marginTop: 8 }} />
      )}
    </>
  );
}

/* ---------------- スライド ---------------- */

function MarkdownEditor({ c, patch }: { c: SlideContent; patch: Patch<SlideContent> }) {
  const pages = c.inlineText.split(/^\s*---\s*$/m).filter((p) => p.trim() !== '').length;
  return (
    <Field
      label="Markdown（--- の行で改ページ）"
      hint={`見出し #, リスト, 表, 太字, 画像 ![](oc://assets/xxx.png) が使えます。現在 ${pages} ページ。`}
    >
      <textarea
        className="textarea mono"
        style={{ minHeight: 380, fontSize: 13 }}
        value={c.inlineText}
        onChange={(e) => patch((x) => void (x.inlineText = e.target.value))}
        spellCheck={false}
      />
    </Field>
  );
}

/** Marp などで書いた .md を元の場所のまま参照する */
function ExternalMarkdownField({ c, patch }: { c: SlideContent; patch: Patch<SlideContent> }) {
  const [exists, setExists] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!c.externalPath) {
      setExists(null);
      setPreview(null);
      return;
    }
    api.file.exists(c.externalPath).then(setExists);
    api.file
      .readText(c.externalPath)
      .then((t) => setPreview(t.slice(0, 600)))
      .catch(() => setPreview(null));
  }, [c.externalPath]);

  return (
    <>
      <Field
        label="Markdown ファイル（.md）"
        hint="コピーせず元のファイルを参照します。Marp 側で編集した内容は、進行画面を開き直せばそのまま反映されます。画像の相対パスも解決されます。"
      >
        <div className="row">
          <input className="input mono small" readOnly value={c.externalPath ?? '未設定'} />
          <button
            className="btn"
            onClick={async () => {
              const abs = await api.file.pick([{ name: 'Markdown', extensions: ['md', 'markdown'] }]);
              if (abs) patch((x) => void (x.externalPath = abs));
            }}
          >
            選択…
          </button>
          {c.externalPath && (
            <button className="btn ghost sm" onClick={() => api.file.reveal(c.externalPath!)}>
              場所を開く
            </button>
          )}
        </div>
      </Field>
      {c.externalPath && exists === false && (
        <div className="banner error" style={{ marginBottom: 14 }}>
          ファイルが見つかりません。移動・削除されていないか確認してください。
        </div>
      )}
      {preview && (
        <Field label="先頭のプレビュー">
          <pre
            className="mono small"
            style={{ background: '#0d1320', padding: 12, borderRadius: 8, maxHeight: 220, overflow: 'auto', margin: 0 }}
          >
            {preview}
          </pre>
        </Field>
      )}
    </>
  );
}

function SlideEditor({ c, patch }: { c: SlideContent; patch: Patch<SlideContent> }) {
  return (
    <>
      <Field label="形式">
        <select
          className="select"
          value={c.format}
          onChange={(e) => patch((x) => {
            x.format = e.target.value as SlideContent['format'];
            x.src = null;
          })}
        >
          <option value="markdown">Markdown / Marp</option>
          <option value="pdf">PDF</option>
          <option value="html">HTML</option>
        </select>
      </Field>

      {c.format === 'markdown' && (
        <Field label="Markdown の取得元">
          <select
            className="select"
            value={c.markdownSource}
            onChange={(e) => patch((x) => void (x.markdownSource = e.target.value as SlideContent['markdownSource']))}
          >
            <option value="inline">アプリ内で編集する</option>
            <option value="file">ローカルの .md ファイルを指定する（Marp 連携）</option>
          </select>
        </Field>
      )}

      {c.format === 'markdown' ? (
        c.markdownSource === 'file' ? (
          <ExternalMarkdownField c={c} patch={patch} />
        ) : (
          <MarkdownEditor c={c} patch={patch} />
        )
      ) : (
        <AssetPicker
          label={c.format === 'pdf' ? 'PDF ファイル' : 'HTML ファイル'}
          value={c.src}
          filters={
            c.format === 'pdf'
              ? [{ name: 'PDF', extensions: ['pdf'] }]
              : [{ name: 'HTML', extensions: ['html', 'htm'] }]
          }
          onChange={(rel) => patch((x) => void (x.src = rel))}
          hint={
            c.format === 'html'
              ? 'HTML内から画像等を参照する場合は同名で assets に置かれるため、相対パスは oc://assets/ を使ってください。'
              : 'Marp から書き出した PDF もそのまま使えます。'
          }
        />
      )}

      <NumberField
        label="自動送り"
        value={c.autoAdvanceSec}
        onChange={(v) => patch((x) => void (x.autoAdvanceSec = v))}
        suffix="秒（0 で手動のみ）"
        max={600}
      />
      <AudioFields audio={c.audio} patch={(fn) => patch((x) => fn(x.audio))} />
    </>
  );
}

/* ---------------- クイズ ---------------- */

/**
 * ドラッグ並べ替えの共通処理。
 * つまみ（ハンドル）を draggable にし、行そのものをドロップ先にする。
 */
function useDragReorder(onReorder: (from: number, to: number) => void) {
  const [from, setFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const reset = () => {
    setFrom(null);
    setOver(null);
  };

  /** 行（ドロップ先）に付ける props */
  const rowProps = (i: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (from === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over !== i) setOver(i);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (from !== null && from !== i) onReorder(from, i);
      reset();
    },
    className: [from === i ? 'dragging' : '', over === i && from !== i ? 'drag-over' : ''].join(' ').trim(),
  });

  /** つまみに付ける props */
  const handleProps = (i: number, rowRef: React.RefObject<HTMLElement>) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setFrom(i);
      e.dataTransfer.effectAllowed = 'move';
      // 既定だとつまみだけが浮くので、行全体をドラッグ中の見た目にする
      if (rowRef.current) e.dataTransfer.setDragImage(rowRef.current, 20, 18);
      // Firefox 等でドラッグを開始させるために何か入れておく
      e.dataTransfer.setData('text/plain', String(i));
    },
    onDragEnd: reset,
  });

  return { rowProps, handleProps, dragging: from !== null };
}

/** 並べ替えたときに「正解」が同じ選択肢を指し続けるように補正する */
function shiftIndex(answer: number, from: number, to: number): number {
  if (answer === from) return to;
  if (from < answer && to >= answer) return answer - 1;
  if (from > answer && to <= answer) return answer + 1;
  return answer;
}

function QuizChoiceRow({
  choice,
  ci,
  qi,
  question,
  patch,
  rowProps,
  handleProps,
}: {
  choice: QuizContent['questions'][number]['choices'][number];
  ci: number;
  qi: number;
  question: QuizContent['questions'][number];
  patch: Patch<QuizContent>;
  rowProps: (i: number) => Record<string, unknown>;
  handleProps: (i: number, ref: React.RefObject<HTMLElement>) => Record<string, unknown>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { className, ...rest } = rowProps(ci) as { className: string };
  return (
    <div ref={ref} className={`drag-row ${className}`} {...rest}>
      <span className="drag-handle" title="ドラッグして並べ替え" {...handleProps(ci, ref)}>
        ⠿
      </span>
      <input
        type="radio"
        name={`ans_${question.id}`}
        checked={question.answerIndex === ci}
        onChange={() => patch((x) => void (x.questions[qi].answerIndex = ci))}
        title="正解にする"
      />
      <input
        className="input"
        value={choice.text}
        onChange={(e) => patch((x) => void (x.questions[qi].choices[ci].text = e.target.value))}
      />
      <button
        className="btn sm danger"
        disabled={question.choices.length <= 2}
        onClick={() =>
          patch((x) => {
            const q = x.questions[qi];
            q.choices.splice(ci, 1);
            if (q.answerIndex > ci) q.answerIndex -= 1;
            if (q.answerIndex >= q.choices.length) q.answerIndex = 0;
          })
        }
      >
        ✕
      </button>
    </div>
  );
}

function QuizChoiceList({
  question,
  qi,
  patch,
}: {
  question: QuizContent['questions'][number];
  qi: number;
  patch: Patch<QuizContent>;
}) {
  const { rowProps, handleProps } = useDragReorder((from, to) =>
    patch((x) => {
      const q = x.questions[qi];
      const [item] = q.choices.splice(from, 1);
      q.choices.splice(to, 0, item);
      q.answerIndex = shiftIndex(q.answerIndex, from, to);
    })
  );

  return (
    <div className="col" style={{ gap: 6 }}>
      {question.choices.map((ch, ci) => (
        <QuizChoiceRow
          key={ch.id}
          choice={ch}
          ci={ci}
          qi={qi}
          question={question}
          patch={patch}
          rowProps={rowProps}
          handleProps={handleProps}
        />
      ))}
      <button
        className="btn sm"
        onClick={() => patch((x) => void x.questions[qi].choices.push({ id: uid('c'), text: '' }))}
      >
        ＋ 選択肢
      </button>
    </div>
  );
}


function QuizEditor({ c, patch }: { c: QuizContent; patch: Patch<QuizContent> }) {
  return (
    <>
      <NumberField
        label="制限時間"
        value={c.timeLimitSec}
        onChange={(v) => patch((x) => void (x.timeLimitSec = v))}
        suffix="秒（0 で無制限）"
        max={600}
      />
      <Toggle label="回答後に解説を表示" checked={c.showExplanation} onChange={(v) => patch((x) => void (x.showExplanation = v))} />
      <AudioFields audio={c.audio} patch={(fn) => patch((x) => fn(x.audio))} />

      <div className="col">
        {c.questions.map((q, qi) => (
          <div className="card" key={q.id}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="chip">Q{qi + 1}</span>
              <div className="spacer" />
              <button className="btn sm ghost" disabled={qi === 0} onClick={() => patch((x) => {
                const [it] = x.questions.splice(qi, 1);
                x.questions.splice(qi - 1, 0, it);
              })}>↑</button>
              <button className="btn sm ghost" disabled={qi === c.questions.length - 1} onClick={() => patch((x) => {
                const [it] = x.questions.splice(qi, 1);
                x.questions.splice(qi + 1, 0, it);
              })}>↓</button>
              <button className="btn sm danger" onClick={() => patch((x) => void x.questions.splice(qi, 1))}>削除</button>
            </div>
            <Field label="問題文">
              <textarea
                className="textarea"
                value={q.text}
                onChange={(e) => patch((x) => void (x.questions[qi].text = e.target.value))}
              />
            </Field>
            <AssetPicker
              label="画像（任意）"
              value={q.imageSrc ?? null}
              filters={[{ name: '画像', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]}
              onChange={(rel) => patch((x) => void (x.questions[qi].imageSrc = rel))}
            />
            <Field label="選択肢（ラジオで正解を指定 / ⠿ をつまんで並べ替え）">
              <QuizChoiceList question={q} qi={qi} patch={patch} />
            </Field>
            <Field label="解説">
              <textarea
                className="textarea"
                value={q.explanation}
                onChange={(e) => patch((x) => void (x.questions[qi].explanation = e.target.value))}
              />
            </Field>
          </div>
        ))}
        <button
          className="btn"
          onClick={() => patch((x) => x.questions.push({
            id: uid('q'),
            text: '',
            choices: [{ id: uid('c'), text: '' }, { id: uid('c'), text: '' }],
            answerIndex: 0,
            explanation: '',
            imageSrc: null,
          }))}
        >＋ 問題を追加</button>
      </div>
    </>
  );
}

/* ---------------- インタラクティブ ---------------- */

function ExamplesField({ examples, onChange }: { examples: string[]; onChange: (v: string[]) => void }) {
  return (
    <Field label="例文ボタン（1行に1つ）" hint="来場者が入力に迷ったときのショートカットとして進行画面に表示されます。">
      <textarea
        className="textarea"
        value={examples.join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n').filter((s) => s.trim() !== ''))}
      />
    </Field>
  );
}

/** ローカル埋め込みモデル（Ruri）の選択とダウンロード */
function RuriPicker({ c, patch }: { c: Interactive1Content; patch: Patch<Interactive1Content> }) {
  const [models, setModels] = useState<Array<{ size: string; label: string; mb: number; ready: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = () => api.local.models().then(setModels);
  useEffect(() => {
    refresh();
  }, []);

  const current = models.find((m) => m.size === (c.ruriSize ?? '130m'));

  return (
    <>
      <Field label="ローカルモデル" hint="大きいほど精度が上がりますが、初回ダウンロードとメモリを食います。">
        <select
          className="select"
          value={c.ruriSize ?? '130m'}
          onChange={(e) => patch((x) => void (x.ruriSize = e.target.value as Interactive1Content['ruriSize']))}
        >
          {models.map((m) => (
            <option key={m.size} value={m.size}>
              {m.label} — {m.mb}MB{m.ready ? '（取得済み）' : ''}
            </option>
          ))}
        </select>
      </Field>
      <div className="row" style={{ marginBottom: 14 }}>
        <button
          className="btn"
          disabled={busy || current?.ready}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await api.local.prepare(c.ruriSize ?? '130m');
              await refresh();
              setMsg('ダウンロードが完了しました。');
            } catch (e) {
              setMsg(errText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {current?.ready ? '取得済み' : busy ? 'ダウンロード中…' : 'モデルを事前ダウンロード'}
        </button>
        {busy && <div className="spin" />}
      </div>
      {msg && <div className="banner ok" style={{ marginBottom: 14 }}>{msg}</div>}
      {!current?.ready && (
        <div className="banner warn" style={{ marginBottom: 14 }}>
          未取得です。展示当日にネットワークが不安定だと困るので、事前にダウンロードしておいてください。
        </div>
      )}
    </>
  );
}

/** llm-jp の埋め込み層のサイズ選択と事前ダウンロード */
function LlmJpPicker({ c, patch }: { c: Interactive1Content; patch: Patch<Interactive1Content> }) {
  const [models, setModels] = useState<Array<{ size: string; label: string; mb: number; dim: number; ready: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = () => api.llmjp.models().then(setModels);
  useEffect(() => {
    refresh();
  }, []);

  const size = c.llmjpSize ?? '150m';
  const current = models.find((m) => m.size === size);

  return (
    <>
      <Field
        label="埋め込み層を借りるモデル"
        hint="モデル全体ではなく、埋め込み層（トークンID → ベクトルの表）だけを取得します。"
        helpTone="ok"
        help={
          <>
            大きいほど次元は上がりますが、「近いことば」の見え方も変わります。手元で確かめた結果は次のとおりです。
            <br />
            <span className="mono">150m ： 学校 → 中学校・小学校・高校 ／ 未来 → 将来・近未来・次世代</span>
            <br />
            <span className="mono">1.8b ： 学校 → がっこう・校長・授業 ／ 未来 → みらい・ミライ・近未来</span>
            <br />
            1.8b は「みらい／ミライ」のような<strong>表記ゆれ</strong>を上位に返しがちで、150m のほうが
            <strong>類義語・上位下位語</strong>を返します。展示で「意味が近いことば」を見せる目的なら 150m が向きます。
          </>
        }
      >
        <select
          className="select"
          value={size}
          onChange={(e) => patch((x) => void (x.llmjpSize = e.target.value as Interactive1Content['llmjpSize']))}
        >
          {models.map((m) => (
            <option key={m.size} value={m.size}>
              {m.label} — {m.mb}MB / {m.dim}次元{m.ready ? '（取得済み）' : ''}
            </option>
          ))}
        </select>
      </Field>
      <div className="row" style={{ marginBottom: 14 }}>
        <button
          className="btn"
          disabled={busy || current?.ready}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await api.llmjp.prepare(size);
              await refresh();
              setMsg('ダウンロードが完了しました。');
            } catch (e) {
              setMsg(errText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {current?.ready ? '取得済み' : busy ? 'ダウンロード中…' : '埋め込み層を事前ダウンロード'}
        </button>
        {busy && <div className="spin" />}
      </div>
      {msg && <div className="banner ok" style={{ marginBottom: 14 }}>{msg}</div>}
      {!current?.ready && (
        <div className="banner warn" style={{ marginBottom: 14 }}>
          未取得です。展示当日にネットワークが不安定だと困るので、事前にダウンロードしておいてください。
        </div>
      )}
    </>
  );
}

function Interactive1Editor({ c, patch }: { c: Interactive1Content; patch: Patch<Interactive1Content> }) {
  return (
    <>
      <div className="banner warn" style={{ marginBottom: 14 }}>
        入力文をトークンに分割し、ベクトルにして可視化します。分割の流儀とベクトル化の取得元は下で選べます。
      </div>
      {/* 「来場者への問いかけ」は画面から外した（入力欄とボタンだけで用が足りるため）。
          設定だけ残すと直しても何も変わらず紛らわしいので、項目ごと出さない */}
      <Field label="入力欄のプレースホルダ">
        <input className="input" value={c.placeholder} onChange={(e) => patch((x) => void (x.placeholder = e.target.value))} />
      </Field>
      <ExamplesField examples={c.examples} onChange={(v) => patch((x) => void (x.examples = v))} />

      <Field
        label="ベクトル化（埋め込み）の取得元"
        helpTone={(c.embeddingSource ?? 'openai') === 'openai' ? 'warn' : 'ok'}
        help={
          (c.embeddingSource ?? 'openai') === 'ruri' ? (
            <>
              日本語に特化したモデルをこのPC内で動かします。APIキー不要・通信なしで、
              3,800語のベクトル化も数秒で終わります（API経由より高速）。
            </>
          ) : (c.embeddingSource ?? 'openai') === 'llmjp' ? (
            <>
              LLM がトークンIDを最初にベクトルへ変換する表（埋め込み層）を、そのまま引きます。
              モデルを動かすのではなく<strong>表を引くだけ</strong>なので、APIキー不要・通信なしで一瞬です。
              <br />
              トークナイザも llm-jp にしておくと、<strong>画面に出ているトークンIDが、そのまま表の行番号</strong>に
              なります。「この数字で表を引くとベクトルが出てくる」という説明がそのまま成立します。
              <br />
              複数トークンに割れる語（「トレーニング」など）は、各トークンのベクトルの平均を使います。
            </>
          ) : (
            <>多言語モデルなので日本語の精度はローカルの Ruri に劣る場合があります。APIキーと通信が必要です。</>
          )
        }
      >
        <select
          className="select"
          value={c.embeddingSource ?? 'openai'}
          onChange={(e) =>
            patch((x) => void (x.embeddingSource = e.target.value as Interactive1Content['embeddingSource']))
          }
        >
          <option value="openai">OpenAI Embeddings API（要APIキー）</option>
          <option value="ruri">ローカル日本語モデル Ruri v3（cl-nagoya）</option>
          <option value="llmjp">llm-jp の埋め込み層（トークンIDで表を引く）</option>
        </select>
      </Field>
      {(c.embeddingSource ?? 'openai') === 'ruri' && <RuriPicker c={c} patch={patch} />}
      {(c.embeddingSource ?? 'openai') === 'llmjp' && <LlmJpPicker c={c} patch={patch} />}

      <Field
        label="入力文を分割するトークナイザ"
        hint="来場者の文をどのモデルの流儀でトークンに分けるかを選びます。"
        helpTone={(c.tokenizerMode ?? 'gpt') === 'ruri' ? 'ok' : 'warn'}
        help={
          (c.tokenizerMode ?? 'gpt') === 'ruri' ? (
            <>
              Ruri v3 が内部で使っているトークナイザ（ModernBERT-Ja 経由の Sarashina2 由来）で分割します。
              <br />
              gpt / llm-jp を選んだ場合、画面に見せる区切りと、このあとベクトルにするときにモデルが使う区切りは
              一致しません（llm-jp と Ruri は語彙の 42% しか重なりません）。
              <span className="mono">[ドラゴン][ボール]</span> と見せて、Ruri は{' '}
              <span className="mono">[ドラゴンボール]</span> と読む、といったズレが起きます。
              ここを Ruri v3 にすると、見せている区切りとモデルの区切りが揃います。
              <br />
              初回だけトークナイザ（7MB弱）をダウンロードします。埋め込みを Ruri にしていない場合でも選べます。
            </>
          ) : (
            <>
              同じ文でも切れ方がまるで違います。
              <br />
              <span className="mono">GPT-4o : [大][規][模][言][語][モデル][は][次][の][単][語][を][予][測][する] → 15個</span>
              <br />
              <span className="mono">llm-jp : [大規模][言語][モデル][は][次][の][単語][を][予測][する] → 10個</span>
              <br />
              <span className="mono">Ruri v3 : [大規模][言語][モデル][は次の][単語][を予測する] → 6個</span>
              <br />
              英語圏で作られたモデルは日本語をほぼ1文字ずつに割るため、同じ内容でもトークン数が増えます
              （＝処理も料金も不利）。llm-jp を選ぶと語彙ファイルの読み込みに初回だけ1〜2秒かかります。
            </>
          )
        }
      >
        <select
          className="select"
          value={c.tokenizerMode ?? 'gpt'}
          onChange={(e) => patch((x) => void (x.tokenizerMode = e.target.value as Interactive1Content['tokenizerMode']))}
        >
          <option value="gpt">GPT-4o（o200k_base）</option>
          <option value="llmjp">llm-jp（日本語LLM）</option>
          <option value="ruri">Ruri v3</option>
        </select>
      </Field>

      <Toggle
        label="単語の下に番号（トークンID）を表示する"
        checked={c.showTokenId ?? true}
        onChange={(v) => patch((x) => void (x.showTokenId = v))}
      />

      <Field
        label="「意味が近いことば」の数値の出し方"
        helpTone="ok"
        help={
          <>
            <strong>1位を100%とする</strong>… 一番近いことばが必ず 100% になり、以下はそれとの比です。
            ローカルモデルは中心化のあと値が小さくなるため、そのまま出すと「1位でも 30%」となって
            説明しづらいのを避けられます。<strong>順位を見せたいときはこちら。</strong>
            <br />
            <strong>コサイン類似度そのもの</strong>… 尺度が一定なので、別の語どうしで数値を比べられます。
            ただし 1 位でも小さい値になることがあります。<strong>数値の意味を正確に見せたいときはこちら。</strong>
            <br />
            どちらでも並び順は変わりません。変わるのは表示される数字だけです。
          </>
        }
      >
        <select
          className="select"
          value={c.similarityDisplay ?? 'relative'}
          onChange={(e) =>
            patch((x) => void (x.similarityDisplay = e.target.value as Interactive1Content['similarityDisplay']))
          }
        >
          <option value="relative">1位を100%とした相対値</option>
          <option value="cosine">コサイン類似度そのもの</option>
        </select>
      </Field>

      <Field
        label="「意味が近いことば」を探す対象"
        hint="来場者がトークンを選んだとき、どの語の集まりの中から近いものを探すかを決めます。"
        helpTone={(c.neighbourSource ?? 'curated') === 'tokenizer' ? 'warn' : 'ok'}
        help={
          (c.neighbourSource ?? 'curated') === 'tokenizer' ? (
            <>
              GPT-4o のトークナイザが実際に持つ語彙から探します。「かな を含む」または「常用漢字のみ（2文字以上）」で
              抽出し、簡体字の中国語と賭博・アダルト系の語幹を除外して 1,842 語になっています。
              <br />
              ただし <span className="mono">天天</span> <span className="mono">提款</span>{' '}
              のような中国語や、<span className="mono">風吹けば名無し</span>{' '}
              のような5ch由来の語は残ります（それがトークナイザの実態です）。来場者に見せる前に一度ご自身で試してください。
              <br />
              初回だけ埋め込み取得に数秒かかります（結果はディスクに保存され、次回以降は不要）。
            </>
          ) : (
            <>
              読みやすく安全な結果になります（猫 → 犬・馬・魚・鳥）。語彙は
              <span className="mono">src/content/vocabulary.ts</span> で編集できます。
            </>
          )
        }
      >
        <select
          className="select"
          value={c.neighbourSource ?? 'curated'}
          onChange={(e) => patch((x) => void (x.neighbourSource = e.target.value as Interactive1Content['neighbourSource']))}
        >
          <option value="curated">辞書（同梱の厳選語彙・約120語）</option>
          <option value="tokenizer">o200k_base から抽出した日本語（約1,840語）</option>
          <option value="llmjp">llm-jp から抽出した日本語（頻度上位6,000語）</option>
        </select>
      </Field>
    </>
  );
}

function Interactive2Editor({ c, patch }: { c: Interactive2Content; patch: Patch<Interactive2Content> }) {
  return (
    <>
      <div className="banner warn" style={{ marginBottom: 14 }}>
        Chat Completions の <span className="mono">top_logprobs</span> を使い、次トークンの候補と確率を1トークンずつ表示します。
      </div>
      <Field label="来場者への問いかけ">
        <input className="input" value={c.prompt} onChange={(e) => patch((x) => void (x.prompt = e.target.value))} />
      </Field>
      <Field label="入力欄のプレースホルダ">
        <input className="input" value={c.placeholder} onChange={(e) => patch((x) => void (x.placeholder = e.target.value))} />
      </Field>
      <ExamplesField examples={c.examples} onChange={(v) => patch((x) => void (x.examples = v))} />
      <NumberField label="表示する候補数" value={c.topK} min={2} max={10} onChange={(v) => patch((x) => void (x.topK = v))} />
      <NumberField label="最大トークン数" value={c.maxSteps} min={1} max={60} onChange={(v) => patch((x) => void (x.maxSteps = v))} suffix="トークンまで伸ばせる" />
      <Toggle
        label="常に確率1位を自動採用する（来場者が選ばない）"
        checked={c.autoPickTop}
        onChange={(v) => patch((x) => void (x.autoPickTop = v))}
      />
    </>
  );
}

/* ---------------- ゲーム ---------------- */

function GameEditor({ c, patch }: { c: GameContent; patch: Patch<GameContent> }) {
  return (
    <>
      <div className="banner warn" style={{ marginBottom: 14 }}>
        事前に用意した問題だけで動くため API 呼び出しは不要です。確率は解説表示用の数値です（合計1.0前後を推奨）。
      </div>
      <NumberField label="1問あたりの制限時間" value={c.timeLimitSec} onChange={(v) => patch((x) => void (x.timeLimitSec = v))} suffix="秒（0 で無制限）" max={300} />
      <NumberField label="正解時の得点" value={c.pointsPerCorrect} onChange={(v) => patch((x) => void (x.pointsPerCorrect = v))} max={10000} step={10} />

      <div className="col">
        {c.rounds.map((r, ri) => (
          <div className="card" key={r.id}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="chip">第{ri + 1}問</span>
              <div className="spacer" />
              <button className="btn sm ghost" disabled={ri === 0} onClick={() => patch((x) => {
                const [it] = x.rounds.splice(ri, 1); x.rounds.splice(ri - 1, 0, it);
              })}>↑</button>
              <button className="btn sm ghost" disabled={ri === c.rounds.length - 1} onClick={() => patch((x) => {
                const [it] = x.rounds.splice(ri, 1); x.rounds.splice(ri + 1, 0, it);
              })}>↓</button>
              <button className="btn sm danger" onClick={() => patch((x) => void x.rounds.splice(ri, 1))}>削除</button>
            </div>
            <Field label="文脈（この続きの単語を当てさせる）" hint="進行画面では「文脈 ___」の形で表示されます。">
              <input className="input" value={r.context} onChange={(e) => patch((x) => void (x.rounds[ri].context = e.target.value))} />
            </Field>
            <Field label="候補（ラジオで正解 / 数値は表示用の確率）">
              <div className="col" style={{ gap: 6 }}>
                {r.choices.map((ch, ci) => (
                  <div className="row" key={ci}>
                    <input
                      type="radio"
                      name={`gans_${r.id}`}
                      checked={r.answerIndex === ci}
                      onChange={() => patch((x) => void (x.rounds[ri].answerIndex = ci))}
                    />
                    <input
                      className="input"
                      value={ch.text}
                      onChange={(e) => patch((x) => void (x.rounds[ri].choices[ci].text = e.target.value))}
                    />
                    <input
                      className="input"
                      style={{ width: 90 }}
                      type="number" min={0} max={1} step={0.01}
                      value={ch.prob}
                      onChange={(e) => patch((x) => void (x.rounds[ri].choices[ci].prob = Number(e.target.value)))}
                    />
                    <button
                      className="btn sm danger"
                      disabled={r.choices.length <= 2}
                      onClick={() => patch((x) => {
                        x.rounds[ri].choices.splice(ci, 1);
                        if (x.rounds[ri].answerIndex >= x.rounds[ri].choices.length) x.rounds[ri].answerIndex = 0;
                      })}
                    >✕</button>
                  </div>
                ))}
                <button className="btn sm" onClick={() => patch((x) => void x.rounds[ri].choices.push({ text: '', prob: 0 }))}>
                  ＋ 候補
                </button>
              </div>
            </Field>
            <Field label="解説">
              <textarea className="textarea" value={r.explanation} onChange={(e) => patch((x) => void (x.rounds[ri].explanation = e.target.value))} />
            </Field>
          </div>
        ))}
        <button
          className="btn"
          onClick={() => patch((x) => x.rounds.push({
            id: uid('r'), context: '', choices: [{ text: '', prob: 0 }, { text: '', prob: 0 }], answerIndex: 0, explanation: '',
          }))}
        >＋ 問題を追加</button>
      </div>
    </>
  );
}

/* ---------------- アンケート ---------------- */

function SurveyEditor({ c, patch }: { c: SurveyContent; patch: Patch<SurveyContent> }) {
  return (
    <>
      <NumberField label="初期人数" value={c.defaultPeople} min={1} max={50} onChange={(v) => patch((x) => void (x.defaultPeople = v))} suffix="人（進行画面の ＋/− で変更可）" />
      <AudioFields audio={c.audio} patch={(fn) => patch((x) => fn(x.audio))} />
      <div className="col">
        {c.questions.map((q, qi) => (
          <div className="card" key={q.id}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="chip">設問{qi + 1}</span>
              <div className="spacer" />
              <button className="btn sm ghost" disabled={qi === 0} onClick={() => patch((x) => {
                const [it] = x.questions.splice(qi, 1); x.questions.splice(qi - 1, 0, it);
              })}>↑</button>
              <button className="btn sm ghost" disabled={qi === c.questions.length - 1} onClick={() => patch((x) => {
                const [it] = x.questions.splice(qi, 1); x.questions.splice(qi + 1, 0, it);
              })}>↓</button>
              <button className="btn sm danger" onClick={() => patch((x) => void x.questions.splice(qi, 1))}>削除</button>
            </div>
            <Field label="設問文">
              <input className="input" value={q.text} onChange={(e) => patch((x) => void (x.questions[qi].text = e.target.value))} />
            </Field>
            <Field label="形式">
              <select
                className="select"
                value={q.kind}
                onChange={(e) => patch((x) => void (x.questions[qi].kind = e.target.value as SurveyQuestionKindLocal))}
              >
                <option value="choice">選択肢</option>
                <option value="scale">5段階評価</option>
              </select>
            </Field>
            {q.kind === 'choice' && (
              <Field label="選択肢（1行に1つ）">
                <textarea
                  className="textarea"
                  value={q.choices.join('\n')}
                  onChange={(e) => patch((x) => void (x.questions[qi].choices = e.target.value.split('\n')))}
                />
              </Field>
            )}
          </div>
        ))}
        <button
          className="btn"
          onClick={() => patch((x) => x.questions.push({ id: uid('sq'), text: '', kind: 'choice', choices: ['', ''] }))}
        >＋ 設問を追加</button>
      </div>
    </>
  );
}
type SurveyQuestionKindLocal = SurveyContent['questions'][number]['kind'];

/* ---------------- 待機画面 ---------------- */

function StandbyEditor({ c, patch }: { c: StandbyContent; patch: Patch<StandbyContent> }) {
  return (
    <>
      <div className="banner warn" style={{ marginBottom: 14 }}>
        説明の合間に出す「お待ちください」画面です。シナリオに挟むほか、進行中に <span className="mono">S</span> キー
        （コントローラの「待機画面」ボタン）でいつでも重ねて表示できます。
      </div>
      <Field label="大きく出すメッセージ">
        <input className="input" value={c.message} onChange={(e) => patch((x) => void (x.message = e.target.value))} />
      </Field>
      <Field label="その下の一行">
        <input className="input" value={c.submessage} onChange={(e) => patch((x) => void (x.submessage = e.target.value))} />
      </Field>
      <Toggle
        label="現在時刻を表示する（画面には「ただいまの時刻」と明示されます）"
        checked={c.showClock}
        onChange={(v) => patch((x) => void (x.showClock = v))}
      />
      <Field label="次の回の開始時刻">
        <select
          className="select"
          value={c.nextStartMode ?? 'hidden'}
          onChange={(e) => patch((x) => void (x.nextStartMode = e.target.value as StandbyContent['nextStartMode']))}
        >
          <option value="hidden">表示しない</option>
          <option value="undecided">「未定」と表示する</option>
          <option value="time">時刻を指定して表示する</option>
        </select>
      </Field>
      {(c.nextStartMode ?? 'hidden') === 'time' && (
        <Field label="開始時刻（HH:MM）" hint="進行画面には残り時間（あと約○分）も一緒に出ます。時刻を過ぎると残り時間は消えます。">
          <input
            className="input mono"
            style={{ width: 140 }}
            type="time"
            value={c.nextStartTime ?? ''}
            onChange={(e) => patch((x) => void (x.nextStartTime = e.target.value))}
          />
        </Field>
      )}
      <NumberField
        label="自動で次へ進む"
        value={c.autoAdvanceSec}
        onChange={(v) => patch((x) => void (x.autoAdvanceSec = v))}
        suffix="秒（0 で手動のみ。1以上でカウントダウン表示）"
        max={3600}
      />
      <AudioFields audio={c.audio} patch={(fn) => patch((x) => fn(x.audio))} alwaysLoop />
      <div className="small muted">
        ※ BGM は待機画面を出している間だけ鳴り、次へ進むと止まります。<strong>最後まで再生したら先頭に戻ります</strong>
        （途中で無音になると「終わった」ように見えるため、待機画面では常にループします）。
        進行中のオン／オフはコントローラ画面から操作します（来場者側の画面にはボタンを出しません）。
      </div>
    </>
  );
}


/* ---------------- 馬券風 次単語予想（裏モード） ---------------- */

function BettingEditor({ c, patch }: { c: BettingContent; patch: Patch<BettingContent> }) {
  const [raceIdx, setRaceIdx] = useState(0);
  const [notice, setNotice] = useState<string[]>([]);
  const race = c.races[Math.min(raceIdx, Math.max(0, c.races.length - 1))];

  /**
   * ノートブックが書き出した races_NN.csv を取り込む。
   * **1ファイル1レース**で何度も取り込む使い方なので、置き換えではなく**追加**する。
   * 同じ race_id のものは新しいほうで差し替える（作り直したときに二重にならない）。
   */
  const importCsv = async () => {
    const abs = await api.file.pick([{ name: 'CSV', extensions: ['csv'] }]);
    if (!abs) return;
    try {
      const { races, warnings } = parseRacesCsv(await api.file.readText(abs));
      const replaced = races.filter((r) => c.races.some((x) => x.id === r.id)).length;
      if (races.length) {
        patch((x) => {
          const incoming = new Set(races.map((r) => r.id));
          x.races = [...x.races.filter((r) => !incoming.has(r.id)), ...races];
        });
      }
      setRaceIdx(0);
      setNotice(
        races.length
          ? [
              `${races.length} レースを追加しました${replaced ? `（うち ${replaced} 件は同じ race_id なので差し替え）` : ''}。`,
              ...warnings,
            ]
          : warnings
      );
    } catch (e) {
      setNotice([errText(e)]);
    }
  };

  /** 選んでいるレースを消す */
  const removeRace = () => {
    patch((x) => void x.races.splice(raceIdx, 1));
    setRaceIdx(0);
    setNotice([]);
  };

  /** オッズのシードを振り直す（同じシードなら毎回同じオッズになるため） */
  const reseed = () => patch((x) => void (x.races[raceIdx].seed = (Math.random() * 2 ** 32) >>> 0));

  const preview = race ? raceOdds(race.entries, race.seed) : null;
  const curve = race
    ? buildRaceCurve(
        race.entries.map((e) => e.layerProbs),
        race.entries.map((e) => e.finalProb),
        c.metersPerLayer
      )
    : null;

  return (
    <>
      <div className="banner warn" style={{ marginBottom: 14 }}>
        高校生向けではなく<b>裏モード</b>です。その場で推論はせず、Colab
        で作った層ごとの確率を CSV で取り込んで使います。作り方は docs/betting-mode.md を参照してください。
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={importCsv}>races_NN.csv を取り込む…</button>
        <span className="small muted">
          {c.races.length} レース登録済み（本番は毎回この中から {c.raceCount} レースをランダムに選びます）
        </span>
      </div>
      {notice.length > 0 && (
        <div className="banner" style={{ marginBottom: 12 }}>
          {notice.map((n, i) => (
            <div key={i} className="small">{n}</div>
          ))}
        </div>
      )}

      <NumberField
        label="初期所持金"
        value={c.startingMoney}
        min={1000}
        max={10000000}
        step={10000}
        suffix="円"
        onChange={(v) => patch((x) => void (x.startingMoney = v))}
      />
      <NumberField
        label="レース数"
        value={c.raceCount}
        min={1}
        max={12}
        onChange={(v) => patch((x) => void (x.raceCount = v))}
      />
      <NumberField
        label="1層あたりの距離"
        value={c.metersPerLayer}
        min={20}
        max={400}
        step={10}
        suffix="m"
        hint="層数 × この値がレース距離になります。100m だと 24層で 2400m。"
        onChange={(v) => patch((x) => void (x.metersPerLayer = v))}
      />
      <Toggle
        label="各レースの開始時に所持金を初期額へ戻す（0円でのゲームオーバーが起きなくなります）"
        checked={c.refillPerRace}
        onChange={(v) => patch((x) => void (x.refillPerRace = v))}
      />

      {race && preview && curve && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
            <select className="input" value={raceIdx} onChange={(e) => setRaceIdx(Number(e.target.value))}>
              {c.races.map((r, i) => (
                <option key={r.id} value={i}>
                  {r.name}（{r.entries.length}頭 / {r.entries[0]?.layerProbs.length ?? 0}層）
                </option>
              ))}
            </select>
            <button className="btn sm" onClick={reseed}>オッズを引き直す</button>
            <button className="btn sm" onClick={removeRace}>このレースを削除</button>
            <span className="small muted">
              「{race.prompt}」 {curve.distance}m
            </span>
          </div>

          <RankChart curve={curve} words={race.entries.map((e) => e.word)} />

          <table className="racecard" style={{ width: '100%', marginTop: 10 }}>
            <thead>
              <tr>
                <th>馬番</th>
                <th>単語</th>
                <th>最終確率</th>
                <th>オッズ平均</th>
                <th>オッズ分散</th>
                <th>単勝</th>
              </tr>
            </thead>
            <tbody>
              {race.entries.map((e, i) => (
                <tr key={i}>
                  <td className="mono">{i + 1}</td>
                  <td className="word">{e.word}</td>
                  <td>
                    <input
                      className="input mono"
                      style={{ width: 90 }}
                      type="number"
                      step="0.0001"
                      min="0"
                      max="1"
                      value={e.finalProb}
                      onChange={(ev) =>
                        patch((x) => void (x.races[raceIdx].entries[i].finalProb = Number(ev.target.value)))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input mono"
                      style={{ width: 80 }}
                      type="number"
                      step="0.1"
                      min="1"
                      value={e.oddsMean}
                      onChange={(ev) =>
                        patch((x) => void (x.races[raceIdx].entries[i].oddsMean = Number(ev.target.value)))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input mono"
                      style={{ width: 80 }}
                      type="number"
                      step="0.1"
                      min="0"
                      value={e.oddsVar}
                      onChange={(ev) =>
                        patch((x) => void (x.races[raceIdx].entries[i].oddsVar = Number(ev.target.value)))
                      }
                    />
                  </td>
                  <td className="mono odds">{preview.win[i].toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <LayerEditor
            race={race}
            onChange={(wi, li, v) =>
              patch((x) => void (x.races[raceIdx].entries[wi].layerProbs[li] = v))
            }
          />
        </div>
      )}
    </>
  );
}

/** 補正後の順位変動。Colab のグラフと同じものをアプリ側でも見られるようにする */
function RankChart({ curve, words }: { curve: ReturnType<typeof buildRaceCurve>; words: string[] }) {
  const W = 640;
  const H = 200;
  const n = curve.positions.length;
  const T = curve.positions[0]?.length ?? 0;
  if (!n || !T) return null;
  const x = (t: number) => (t / (T - 1 || 1)) * (W - 60) + 40;
  const y = (rank: number) => 14 + (rank / (n - 1 || 1)) * (H - 28);

  // 各層での順位
  const ranks: number[][] = [];
  for (let t = 0; t < T; t++) {
    const order = curve.positions
      .map((p, i) => ({ v: p[t], i }))
      .sort((a, b) => b.v - a.v)
      .map((o) => o.i);
    const r = new Array<number>(n).fill(0);
    order.forEach((i, k) => (r[i] = k));
    ranks.push(r);
  }

  const hue = (i: number) => `hsl(${(i * 47) % 360} 70% 62%)`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: '#0b1220', borderRadius: 8 }}>
      {curve.positions.map((_, i) => (
        <g key={i}>
          <path
            d={ranks.map((r, t) => `${t === 0 ? 'M' : 'L'}${x(t)} ${y(r[i])}`).join(' ')}
            stroke={hue(i)}
            strokeWidth={1.8}
            fill="none"
            opacity={0.9}
          />
          <text x={x(T - 1) + 4} y={y(ranks[T - 1][i]) + 4} fontSize={9} fill={hue(i)}>
            {words[i]}
          </text>
        </g>
      ))}
      <text x={4} y={12} fontSize={9} fill="#7f8ea8">1着</text>
      <text x={4} y={H - 4} fontSize={9} fill="#7f8ea8">最下位</text>
    </svg>
  );
}

/** 層ごとの確率を直接いじる。粘らせたい語を手で調整するため */
function LayerEditor({
  race,
  onChange,
}: {
  race: BettingRace;
  onChange: (wordIndex: number, layerIndex: number, value: number) => void;
}) {
  const [wi, setWi] = useState(0);
  const e = race.entries[Math.min(wi, race.entries.length - 1)];
  if (!e) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <Field label="層ごとの確率を編集">
        <select className="input" value={wi} onChange={(ev) => setWi(Number(ev.target.value))}>
          {race.entries.map((x, i) => (
            <option key={i} value={i}>
              {i + 1}. {x.word}
            </option>
          ))}
        </select>
      </Field>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {e.layerProbs.map((p, li) => (
          <label key={li} className="small" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="muted">L{li + 1}</span>
            <input
              className="input mono"
              style={{ width: 84 }}
              type="number"
              step="0.001"
              min="0"
              max="1"
              value={p}
              onChange={(ev) => onChange(wi, li, Math.max(0, Number(ev.target.value)))}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/* ---------------- ディスパッチャ ---------------- */

export function ContentEditor({ content, patch }: { content: Content; patch: Patch<Content> }) {
  switch (content.type) {
    case 'video':
      return <VideoEditor c={content} patch={patch as Patch<VideoContent>} />;
    case 'slide':
      return <SlideEditor c={content} patch={patch as Patch<SlideContent>} />;
    case 'quiz':
      return <QuizEditor c={content} patch={patch as Patch<QuizContent>} />;
    case 'interactive1':
      return <Interactive1Editor c={content} patch={patch as Patch<Interactive1Content>} />;
    case 'interactive2':
      return <Interactive2Editor c={content} patch={patch as Patch<Interactive2Content>} />;
    case 'game':
      return <GameEditor c={content} patch={patch as Patch<GameContent>} />;
    case 'survey':
      return <SurveyEditor c={content} patch={patch as Patch<SurveyContent>} />;
    case 'standby':
      return <StandbyEditor c={content} patch={patch as Patch<StandbyContent>} />;
    case 'betting':
      return <BettingEditor c={content} patch={patch as Patch<BettingContent>} />;
  }
}
