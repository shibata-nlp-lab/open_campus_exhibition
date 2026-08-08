import type { BranchContent } from '../types';
import type { StepProps } from './PlayerApp';
import { useAudio } from './useAudio';

/** 実際に戻れる（シナリオ内に見つかった）戻り先 */
export interface ResolvedTarget {
  id: string;
  /** ボタンに出す文言 */
  label: string;
  /** 飛び先のステップ番号 */
  index: number;
}

interface Props extends StepProps<BranchContent> {
  /** 戻り先のうち、シナリオ内に見つかったものだけ */
  targets: ResolvedTarget[];
  /** 戻り先へ飛ぶ。飛んだ先で「次へ」を押すとこの画面に帰ってくる */
  onJump: (index: number) => void;
}

/**
 * 説明のあとに置く分かれ道。
 * 体験したい人だけを前の体験コンテンツへ戻し、終わったらここへ帰ってくる。
 */
export default function BranchStep({ content, onFinish, targets, onJump }: Props) {
  useAudio(content.audio);

  return (
    <div className="stage entry fade-in">
      <h1>{content.message}</h1>
      {content.submessage && <p className="lead">{content.submessage}</p>}
      {/* 戻り先が増えても押しやすいよう、数が多いときは折り返す */}
      <div className="row" style={{ gap: 16, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {targets.map((t) => (
          <button key={t.id} className="btn lg primary" onClick={() => onJump(t.index)}>
            {t.label}
          </button>
        ))}
      </div>
      <button className="btn lg" onClick={onFinish}>
        {content.stayLabel || 'ここで終わる'}
      </button>
    </div>
  );
}
