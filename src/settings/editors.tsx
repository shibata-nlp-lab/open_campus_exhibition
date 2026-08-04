import { useEffect, useRef, useState } from 'react';
import type {
  AudioSetting,
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
import { api } from '../lib/api';
import { AssetPicker, Field, NumberField, Toggle } from './common';

type Patch<T> = (fn: (c: T) => void) => void;

/* ---------------- 共通：音声設定 ---------------- */

function AudioFields({ audio, patch }: { audio: AudioSetting; patch: (fn: (a: AudioSetting) => void) => void }) {
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
        <Toggle label="ループ再生" checked={audio.loop} onChange={(v) => patch((a) => void (a.loop = v))} />
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
            <Field label="選択肢（ラジオで正解を指定）">
              <div className="col" style={{ gap: 6 }}>
                {q.choices.map((ch, ci) => (
                  <div className="row" key={ch.id}>
                    <input
                      type="radio"
                      name={`ans_${q.id}`}
                      checked={q.answerIndex === ci}
                      onChange={() => patch((x) => void (x.questions[qi].answerIndex = ci))}
                    />
                    <input
                      className="input"
                      value={ch.text}
                      onChange={(e) => patch((x) => void (x.questions[qi].choices[ci].text = e.target.value))}
                    />
                    <button
                      className="btn sm danger"
                      disabled={q.choices.length <= 2}
                      onClick={() => patch((x) => {
                        x.questions[qi].choices.splice(ci, 1);
                        if (x.questions[qi].answerIndex >= x.questions[qi].choices.length)
                          x.questions[qi].answerIndex = 0;
                      })}
                    >✕</button>
                  </div>
                ))}
                <button
                  className="btn sm"
                  onClick={() => patch((x) => void x.questions[qi].choices.push({ id: uid('c'), text: '' }))}
                >＋ 選択肢</button>
              </div>
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

function Interactive1Editor({ c, patch }: { c: Interactive1Content; patch: Patch<Interactive1Content> }) {
  return (
    <>
      <div className="banner warn" style={{ marginBottom: 14 }}>
        入力文をトークンに分割（js-tiktoken / o200k_base）し、OpenAI Embeddings API でベクトル化して可視化します。
      </div>
      <Field label="来場者への問いかけ">
        <input className="input" value={c.prompt} onChange={(e) => patch((x) => void (x.prompt = e.target.value))} />
      </Field>
      <Field label="入力欄のプレースホルダ">
        <input className="input" value={c.placeholder} onChange={(e) => patch((x) => void (x.placeholder = e.target.value))} />
      </Field>
      <ExamplesField examples={c.examples} onChange={(v) => patch((x) => void (x.examples = v))} />
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
      <Toggle label="現在時刻を表示する" checked={c.showClock} onChange={(v) => patch((x) => void (x.showClock = v))} />
      <NumberField
        label="自動で次へ進む"
        value={c.autoAdvanceSec}
        onChange={(v) => patch((x) => void (x.autoAdvanceSec = v))}
        suffix="秒（0 で手動のみ。1以上でカウントダウン表示）"
        max={3600}
      />
      <AudioFields audio={c.audio} patch={(fn) => patch((x) => fn(x.audio))} />
      <div className="small muted">※ BGM は待機画面を出している間だけ鳴り、次へ進むと止まります。</div>
    </>
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
  }
}
