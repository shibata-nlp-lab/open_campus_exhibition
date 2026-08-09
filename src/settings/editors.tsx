import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type {
  AudioSetting,
  BranchContent,
  BranchTarget,
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
import { CONTENT_LABELS, emptyAudio, uid } from '../defaults';
import { api, errText } from '../lib/api';
import { AssetPicker, Field, NumberField, Toggle } from './common';
import { shiftIndex } from '../lib/reorder';

type Patch<T> = (fn: (c: T) => void) => void;

/* ---------------- 共通：音声設定 ---------------- */

function AudioFields({
  audio,
  patch,
  alwaysLoop = false,
  title = 'この最中に流す音声',
}: {
  audio: AudioSetting;
  patch: (fn: (a: AudioSetting) => void) => void;
  /** 待機画面のように必ずループさせるものは、トグルを出さず説明だけにする */
  alwaysLoop?: boolean;
  /** 画面ごとに複数並べるときの見出し */
  title?: string;
}) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="small muted" style={{ marginBottom: 8 }}>{title}</div>
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

/**
 * 体験①/② の「画面ごとの音声」。
 * 1つのコンテンツの中で画面が切り替わるので、コンテンツ全体に1つ付ける他の種別と違い
 * 画面の数だけ並べる。ナレーションを想定しているので既定ではループしない。
 */
function ScreenAudioFields<T extends Interactive1Content | Interactive2Content>({
  c,
  patch,
  screens,
}: {
  c: T;
  patch: Patch<T>;
  screens: Array<{ key: string; label: string }>;
}) {
  type Screens = T['screenAudio'];
  return (
    <>
      <div className="small muted" style={{ margin: '18px 0 8px' }}>
        画面ごとの音声 — 画面が切り替わると前の音は止まります。使わない画面は空のままにしてください。
      </div>
      {screens.map((s) => (
        <AudioFields
          key={s.key}
          title={s.label}
          audio={(c.screenAudio as Record<string, AudioSetting> | undefined)?.[s.key] ?? emptyAudio()}
          patch={(fn) =>
            patch((x) => {
              // 古い config には screenAudio が無いことがあるので、触る直前に補う
              const all = ((x.screenAudio ??= {} as Screens) as unknown) as Record<string, AudioSetting>;
              all[s.key] ??= emptyAudio();
              fn(all[s.key]);
            })
          }
        />
      ))}
    </>
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

/** 体験②で動かすモデルの選択と、事前ダウンロード */
function PredictModelPicker({ c, patch }: { c: Interactive2Content; patch: Patch<Interactive2Content> }) {
  const [models, setModels] = useState<Array<{ id: string; label: string; mb: number; ready: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = () => api.predict.models().then(setModels);
  useEffect(() => {
    refresh();
  }, []);

  const id = c.predictModelId ?? '150m';
  const status = models.find((m) => m.id === id);

  return (
    <>
      <Field
        label="動かすモデル"
        helpTone="ok"
        help={
          <>
            大きいほど候補は納得しやすくなりますが、ダウンロードも1手あたりの時間も増えます。
            手元（Apple Silicon）で測った結果は次のとおりです。
            <br />
            <span className="mono">150m ： 日本の首都は → 東京 57% ／ 次の単語を → 含む・生成</span>
            <br />
            <span className="mono">980m ： 日本の首都は → 東京 77% ／ 次の単語を → 生成 23%・予測 6%</span>
            <br />
            <span className="mono">gemma ： 日本の首都は → ？ 76% ／ 次の単語を → 予測 91%</span>
            <br />
            展示で「次の語を予測している」と見せる目的なら、待ち時間の短い <strong>150m</strong> で十分です。
            <br />
            <strong>gemma-2-2b-jpn は指示チューニング済み</strong>なので、「日本の首都は」のような
            疑問文になりやすい文だと <span className="mono">？</span> を1位に出します。1手 1〜3 秒かかるため、
            12語伸ばすと30秒ほど待ちます。選ぶ場合は例文を平叙文（「私は毎朝コーヒーを」など）にしてください。
            <br />
            モデルを変えたら、下のボタンでそれを取得してください（モデルごとに別のファイルです）。
          </>
        }
      >
        <select
          className="select"
          value={id}
          onChange={(e) => patch((x) => void (x.predictModelId = e.target.value as Interactive2Content['predictModelId']))}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.mb}MB{m.ready ? '（取得済み）' : ''}
            </option>
          ))}
        </select>
      </Field>
      <div className="row" style={{ marginBottom: 14 }}>
        <button
          className="btn"
          disabled={busy || status?.ready}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await api.predict.prepare(id);
              await refresh();
              setMsg('ダウンロードが完了しました。');
            } catch (e) {
              setMsg(errText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {status?.ready ? '取得済み' : busy ? 'ダウンロード中…' : `モデルを事前ダウンロード（約${status?.mb ?? 0}MB）`}
        </button>
        {busy && <div className="spin" />}
      </div>
      {msg && <div className="banner ok" style={{ marginBottom: 14 }}>{msg}</div>}
      {status && !status.ready && (
        <div className="banner warn" style={{ marginBottom: 14 }}>
          未取得です。この状態だと<strong>来場者が最初に試したときにダウンロードが始まり</strong>、
          数分待たせることになります。展示当日に困らないよう、事前に取得しておいてください。
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

      <ScreenAudioFields
        c={c}
        patch={patch}
        screens={[
          { key: 'input', label: '入力画面（単語に分ける前）' },
          { key: 'tokens', label: 'STEP 1 — 単語分割の画面' },
          { key: 'vectors', label: 'STEP 2 — ベクトル化の画面' },
        ]}
      />
    </>
  );
}

function Interactive2Editor({ c, patch }: { c: Interactive2Content; patch: Patch<Interactive2Content> }) {
  return (
    <>
      <div className="banner warn" style={{ marginBottom: 14 }}>
        Chat Completions の <span className="mono">top_logprobs</span> を使い、次トークンの候補と確率を1トークンずつ表示します。
      </div>
      <Field
        label="次の単語の確率の取得元"
        helpTone={(c.predictSource ?? 'openai') === 'openai' ? 'warn' : 'ok'}
        help={
          (c.predictSource ?? 'openai') === 'local' ? (
            <>
              日本語モデルをこのPC内で動かします。APIキーも通信も要らず、
              1手あたり 0.05〜3 秒（モデルによる）で返ります。日本語のモデルなので候補が語のかたまりで出て、
              GPT より読みやすくなります（<span className="mono">日本の首都は → 東京 57%</span>）。
              <br />
              体験①の「llm-jp の埋め込み層」とは別物です。あちらは表を引くだけ、こちらはモデル本体を動かします。
              初回だけモデルのダウンロードが要るので、下のボタンで先に取得してください。
            </>
          ) : (
            <>
              OpenAI の <span className="mono">top_logprobs</span> を使います。APIキーと通信が必要で、
              会場のネットワークが不安定だとオフライン簡易モードに落ちます。
              英語圏のモデルなので、日本語の候補は1文字ずつに割れがちです。
            </>
          )
        }
      >
        <select
          className="select"
          value={c.predictSource ?? 'openai'}
          onChange={(e) => patch((x) => void (x.predictSource = e.target.value as Interactive2Content['predictSource']))}
        >
          <option value="openai">OpenAI Chat Completions（要APIキー）</option>
          <option value="local">日本語モデル（APIキー不要）</option>
        </select>
      </Field>
      {(c.predictSource ?? 'openai') === 'local' && <PredictModelPicker c={c} patch={patch} />}

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

      <ScreenAudioFields
        c={c}
        patch={patch}
        screens={[
          { key: 'input', label: '入力画面（予測を始める前）' },
          { key: 'predict', label: '予測中の画面' },
        ]}
      />
    </>
  );
}

/* ---------------- ゲーム ---------------- */


/** ゲームの候補1行。クイズと同じつまみで並べ替えできる */
function GameChoiceRow({
  round,
  ri,
  ci,
  patch,
  rowProps,
  handleProps,
}: {
  round: GameContent['rounds'][number];
  ri: number;
  ci: number;
  patch: Patch<GameContent>;
  rowProps: (i: number) => Record<string, unknown>;
  handleProps: (i: number, ref: React.RefObject<HTMLElement>) => Record<string, unknown>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ch = round.choices[ci];
  const { className, ...rest } = rowProps(ci) as { className: string };
  return (
    <div ref={ref} className={`drag-row ${className}`} {...rest}>
      <span className="drag-handle" title="ドラッグして並べ替え" {...handleProps(ci, ref)}>
        ⠿
      </span>
      <input
        type="radio"
        name={`gans_${round.id}`}
        checked={round.answerIndex === ci}
        onChange={() => patch((x) => void (x.rounds[ri].answerIndex = ci))}
        title="正解にする"
      />
      <input
        className="input"
        value={ch.text}
        onChange={(e) => patch((x) => void (x.rounds[ri].choices[ci].text = e.target.value))}
      />
      <input
        className="input"
        style={{ width: 90 }}
        type="number"
        min={0}
        max={1}
        step={0.01}
        value={ch.prob}
        onChange={(e) => patch((x) => void (x.rounds[ri].choices[ci].prob = Number(e.target.value)))}
      />
      <button
        className="btn sm danger"
        disabled={round.choices.length <= 2}
        onClick={() =>
          patch((x) => {
            x.rounds[ri].choices.splice(ci, 1);
            x.rounds[ri].answerIndex = Math.min(x.rounds[ri].answerIndex, x.rounds[ri].choices.length - 1);
          })
        }
      >
        ✕
      </button>
    </div>
  );
}

function GameChoiceList({ round, ri, patch }: { round: GameContent['rounds'][number]; ri: number; patch: Patch<GameContent> }) {
  const { rowProps, handleProps } = useDragReorder((from, to) =>
    patch((x) => {
      const r = x.rounds[ri];
      const [item] = r.choices.splice(from, 1);
      r.choices.splice(to, 0, item);
      // 並べ替えても「正解」は同じ候補を指し続ける
      r.answerIndex = shiftIndex(r.answerIndex, from, to);
    })
  );

  return (
    <div className="col" style={{ gap: 6 }}>
      {round.choices.map((_, ci) => (
        <GameChoiceRow key={ci} round={round} ri={ri} ci={ci} patch={patch} rowProps={rowProps} handleProps={handleProps} />
      ))}
      <button className="btn sm" onClick={() => patch((x) => void x.rounds[ri].choices.push({ text: '', prob: 0 }))}>
        ＋ 候補
      </button>
    </div>
  );
}

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
            <Field label="候補（ラジオで正解 / 数値は表示用の確率）" hint="⠿ をドラッグすると並べ替えられます。正解の指定は候補についていくので、並べ替えてもずれません。">
              <GameChoiceList round={r} ri={ri} patch={patch} />
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

/* ---------------- 分岐（体験に戻る） ---------------- */

function BranchTargetRow({
  target,
  ti,
  patch,
  choices,
  rowProps,
  handleProps,
}: {
  target: BranchTarget;
  ti: number;
  patch: Patch<BranchContent>;
  choices: Content[];
  rowProps: (i: number) => Record<string, unknown>;
  handleProps: (i: number, ref: React.RefObject<HTMLElement>) => Record<string, unknown>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { className, ...rest } = rowProps(ti) as { className: string };
  const picked = choices.find((x) => x.id === target.contentId);
  return (
    <div ref={ref} className={`drag-row ${className}`} {...rest}>
      <span className="drag-handle" title="ドラッグして並べ替え" {...handleProps(ti, ref)}>
        ⠿
      </span>
      <select
        className="select"
        style={{ flex: 1 }}
        value={target.contentId ?? ''}
        onChange={(e) => patch((x) => void (x.targets[ti].contentId = e.target.value || null))}
      >
        <option value="">（選択なし）</option>
        {choices.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}（{CONTENT_LABELS[t.type]}）
          </option>
        ))}
      </select>
      <input
        className="input"
        style={{ flex: 1 }}
        // 空ならコンテンツ名がそのままボタンになるので、それを薄字で見せておく
        placeholder={picked ? picked.name : 'ボタンの文言'}
        value={target.label}
        onChange={(e) => patch((x) => void (x.targets[ti].label = e.target.value))}
      />
      <button className="btn sm danger" onClick={() => patch((x) => void x.targets.splice(ti, 1))}>
        ✕
      </button>
    </div>
  );
}

function BranchTargetList({
  c,
  patch,
  choices,
}: {
  c: BranchContent;
  patch: Patch<BranchContent>;
  choices: Content[];
}) {
  const { rowProps, handleProps } = useDragReorder((from, to) =>
    patch((x) => {
      const [item] = x.targets.splice(from, 1);
      x.targets.splice(to, 0, item);
    })
  );
  const targets = c.targets ?? [];
  return (
    <div className="col" style={{ gap: 6 }}>
      {targets.map((t, ti) => (
        <BranchTargetRow
          key={t.id}
          target={t}
          ti={ti}
          patch={patch}
          choices={choices}
          rowProps={rowProps}
          handleProps={handleProps}
        />
      ))}
      {targets.length === 0 && (
        <div className="small muted">
          戻り先がありません。このままだと進行画面には「{c.stayLabel || 'ここで終わる'}」だけが出ます。
        </div>
      )}
      <div>
        <button
          className="btn sm"
          onClick={() => patch((x) => void (x.targets ??= []).push({ id: uid('bt'), contentId: null, label: '' }))}
        >
          ＋ 戻り先を追加
        </button>
      </div>
    </div>
  );
}

function BranchEditor({
  c,
  patch,
  contents,
}: {
  c: BranchContent;
  patch: Patch<BranchContent>;
  contents: Content[];
}) {
  // 戻り先は体験・ゲームを想定しているが、スライドに戻したい場合もあるので
  // 分岐そのものと待機画面以外は選べるようにしておく
  const choices = contents.filter((x) => x.type !== 'branch' && x.type !== 'standby');
  return (
    <>
      <div className="banner warn" style={{ marginBottom: 14 }}>
        説明のあとに置いて「体験したい人だけ」を前の体験に戻す画面です。<strong>戻り先は何個でも置けます</strong>
        （体験①・体験②・ゲームを並べる、など）。戻った先で「次へすすむ」を押すと、
        次のコンテンツではなく<strong>この画面に帰ってきます</strong>ので、続けて別のものも選べます。
        「{c.stayLabel || 'ここで終わる'}」を選ぶと先へ進みます。
      </div>
      <Field label="見出し">
        <input className="input" value={c.message} onChange={(e) => patch((x) => void (x.message = e.target.value))} />
      </Field>
      <Field label="補足">
        <input
          className="input"
          value={c.submessage}
          onChange={(e) => patch((x) => void (x.submessage = e.target.value))}
        />
      </Field>
      <Field
        label="戻り先（並べた順にボタンが出ます）"
        hint="同じシナリオの中に、この分岐より前に置いてあるものを選んでください。シナリオに入っていない戻り先は、ボタンごと出ません。⠿ をドラッグすると並べ替えられます。"
      >
        <BranchTargetList c={c} patch={patch} choices={choices} />
      </Field>
      <Field label="進むボタンの文言">
        <input
          className="input"
          value={c.stayLabel}
          onChange={(e) => patch((x) => void (x.stayLabel = e.target.value))}
        />
      </Field>
      <AudioFields audio={c.audio} patch={(fn) => patch((x) => fn(x.audio))} />
    </>
  );
}

/* ---------------- ディスパッチャ ---------------- */

export function ContentEditor({
  content,
  patch,
  contents = [],
}: {
  content: Content;
  patch: Patch<Content>;
  /** 他のコンテンツを参照する種別（分岐）のための一覧 */
  contents?: Content[];
}) {
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
    case 'branch':
      return (
        <BranchEditor
          c={content}
          patch={patch as Patch<BranchContent>}
          contents={contents.filter((x) => x.id !== content.id)}
        />
      );
    case 'standby':
      return <StandbyEditor c={content} patch={patch as Patch<StandbyContent>} />;
  }
}
