import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import type { SlideContent } from '../types';
import type { StepProps } from './PlayerApp';
import { api, errText } from '../lib/api';
import { useAudio, useStepKeys } from './useAudio';
import { DEFAULT_INTRO_MARKDOWN } from '../defaults';

/** Marp のフロントマター / ディレクティブを取り除き、--- で分割 */
function splitMarkdown(src: string): string[] {
  let text = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''); // フロントマター
  text = text.replace(/^<!--[\s\S]*?-->\s*$/gm, ''); // Marp のコメントディレクティブ
  const pages = text.split(/^\s*---\s*$/m).map((p) => p.trim()).filter((p) => p.length > 0);
  return pages.length ? pages : [text];
}

/**
 * 外部 .md を参照している場合、相対パスの画像を ocfile:// に置き換えて表示できるようにする。
 * baseDir は .md が置かれているディレクトリの絶対パス。
 */
function resolveRelativeAssets(html: string, baseDir: string | null): string {
  if (!baseDir) return html;
  return html.replace(/(src|href)="([^"]+)"/g, (whole, attr, value: string) => {
    if (/^([a-z]+:|#|\/\/)/i.test(value)) return whole;
    try {
      const abs = new URL(value, `file://${baseDir.endsWith('/') ? baseDir : baseDir + '/'}`).pathname;
      return `${attr}="${api.file.url(decodeURIComponent(abs))}"`;
    } catch {
      return whole;
    }
  });
}

function MarkdownSlides({
  src,
  onEnd,
  onBack,
  autoSec,
  baseDir,
  onPage,
}: {
  src: string;
  onEnd: () => void;
  onBack: () => void;
  autoSec: number;
  baseDir: string | null;
  onPage?: (page: number, total: number) => void;
}) {
  const pages = splitMarkdown(src);
  const [page, setPage] = useState(0);

  useEffect(() => {
    onPage?.(page + 1, pages.length);
  }, [page, pages.length]);

  const next = () => (page + 1 < pages.length ? setPage(page + 1) : onEnd());
  const prev = () => (page > 0 ? setPage(page - 1) : onBack());
  useStepKeys({ next, prev });

  useEffect(() => {
    if (!autoSec) return;
    const t = window.setTimeout(next, autoSec * 1000);
    return () => window.clearTimeout(t);
  }, [page, autoSec]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        className="slide-md fade-in"
        key={page}
        dangerouslySetInnerHTML={{
          __html: resolveRelativeAssets(marked.parse(pages[page]) as string, baseDir),
        }}
      />
      <SlideBar page={page} total={pages.length} onPrev={prev} onNext={next} />
    </div>
  );
}

function PdfSlides({
  rel,
  onEnd,
  onBack,
  autoSec,
  onPage,
}: {
  rel: string;
  onEnd: () => void;
  onBack: () => void;
  autoSec: number;
  onPage?: (page: number, total: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<any>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs: any = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const doc = await pdfjs.getDocument(api.asset.url(rel)).promise;
        if (cancelled) return;
        docRef.current = doc;
        setTotal(doc.numPages);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      docRef.current?.destroy?.();
    };
  }, [rel]);

  useEffect(() => {
    (async () => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;
      const p = await doc.getPage(page);
      const wrap = canvas.parentElement!;
      const base = p.getViewport({ scale: 1 });
      const scale = Math.min(wrap.clientWidth / base.width, wrap.clientHeight / base.height) * (window.devicePixelRatio || 1);
      const viewport = p.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
      canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1)}px`;
      await p.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    })();
  }, [page, total]);

  const next = () => (page < total ? setPage(page + 1) : onEnd());
  const prev = () => (page > 1 ? setPage(page - 1) : onBack());
  useStepKeys({ next, prev });

  useEffect(() => {
    if (total) onPage?.(page, total);
  }, [page, total]);

  useEffect(() => {
    if (!autoSec || !total) return;
    const t = window.setTimeout(next, autoSec * 1000);
    return () => window.clearTimeout(t);
  }, [page, autoSec, total]);

  if (error) {
    return (
      <div className="stage">
        <h2>PDF を読み込めませんでした</h2>
        <p className="lead mono small">{error}</p>
        <button className="btn lg primary" onClick={onEnd}>次へ</button>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="slide-canvas-wrap" style={{ flex: 1, minHeight: 0 }}>
        <canvas ref={canvasRef} />
      </div>
      <SlideBar page={page - 1} total={total} onPrev={prev} onNext={next} />
    </div>
  );
}

function HtmlSlide({ rel, onEnd, onBack }: { rel: string; onEnd: () => void; onBack: () => void }) {
  useStepKeys({ next: onEnd, prev: onBack });
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <iframe className="slide-frame" src={api.asset.url(rel)} style={{ flex: 1 }} />
      <SlideBar page={0} total={1} onPrev={onBack} onNext={onEnd} />
    </div>
  );
}

function SlideBar({ page, total, onPrev, onNext }: { page: number; total: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="row" style={{ padding: '10px 20px', justifyContent: 'center', gap: 18, background: '#0a0f1a' }}>
      <button className="btn" onClick={onPrev}>◀ 前</button>
      <span className="small muted">{total > 1 ? `${page + 1} / ${total}` : ''}</span>
      <button className="btn primary" onClick={onNext}>次 ▶</button>
    </div>
  );
}

export default function SlideStep({ content, onFinish, onDetail }: StepProps<SlideContent>) {
  const audio = useAudio(content.audio);
  const [mdText, setMdText] = useState<string | null>(null);
  const [mdError, setMdError] = useState<string | null>(null);

  const external = content.markdownSource === 'file' ? content.externalPath : null;
  const baseDir = external ? external.slice(0, external.lastIndexOf('/')) : null;

  useEffect(() => {
    if (content.format !== 'markdown') return;
    setMdError(null);
    // 外部ファイル参照：表示のたびに読み直すので Marp 側の編集がそのまま反映される
    if (content.markdownSource === 'file') {
      if (!content.externalPath) {
        setMdText('');
        setMdError('Markdown ファイルが指定されていません。');
        return;
      }
      api.file
        .readText(content.externalPath)
        .then(setMdText)
        .catch((e) => {
          setMdText('');
          setMdError(errText(e));
        });
      return;
    }
    setMdText(content.inlineText.trim() ? content.inlineText : DEFAULT_INTRO_MARKDOWN);
  }, [content.inlineText, content.format, content.markdownSource, content.externalPath]);

  const back = () => {}; // 先頭でさらに戻る操作は無視（コンテンツ移動は P キー / ◀ ボタン）

  let body: JSX.Element;
  if (content.format === 'markdown') {
    if (mdError) {
      body = (
        <div className="stage">
          <h2>スライドを読み込めませんでした</h2>
          <p className="lead small mono">{mdError}</p>
          <button className="btn lg primary" onClick={onFinish}>次へ</button>
        </div>
      );
    } else if (mdText === null) {
      body = <div className="stage"><div className="spin" /></div>;
    } else {
      body = (
        <MarkdownSlides
          src={mdText}
          onEnd={onFinish}
          onBack={back}
          autoSec={content.autoAdvanceSec}
          baseDir={baseDir}
          onPage={(p, t) => onDetail?.(`${p} / ${t} ページ`)}
        />
      );
    }
  } else if (!content.src) {
    body = (
      <div className="stage">
        <h1>スライドが未設定です</h1>
        <button className="btn lg primary" onClick={onFinish}>次へ</button>
      </div>
    );
  } else if (content.format === 'pdf') {
    body = (
      <PdfSlides
        rel={content.src}
        onEnd={onFinish}
        onBack={back}
        autoSec={content.autoAdvanceSec}
        onPage={(p, t) => onDetail?.(`${p} / ${t} ページ`)}
      />
    );
  } else {
    body = <HtmlSlide rel={content.src} onEnd={onFinish} onBack={back} />;
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {body}
      {audio.hasAudio && (
        <button
          className="btn sm"
          style={{ position: 'absolute', top: 16, right: 16, zIndex: 5 }}
          onClick={audio.toggleMute}
        >
          {audio.muted ? '🔇' : '🔊'}
        </button>
      )}
    </div>
  );
}
