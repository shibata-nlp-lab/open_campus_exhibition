import type { BranchContent } from '../types';
import type { StepProps } from './PlayerApp';
import { useAudio } from './useAudio';

interface Props extends StepProps<BranchContent> {
  /** 戻り先のステップ番号。シナリオ内に見つからなければ -1 */
  targetIndex: number;
  /** 戻り先へ飛ぶ。飛んだ先で「次へ」を押すとこの画面に帰ってくる */
  onJump: () => void;
}

/**
 * 説明のあとに置く分かれ道。
 * 体験したい人だけを前の体験コンテンツへ戻し、終わったらここへ帰ってくる。
 */
export default function BranchStep({ content, onFinish, targetIndex, onJump }: Props) {
  useAudio(content.audio);
  // 戻り先が見つからないときは選ばせない。ボタンを押しても何も起きない状態が
  // 展示中にいちばん困るので、はじめから「次へ」だけにする
  const canGo = targetIndex >= 0;

  return (
    <div className="stage entry fade-in">
      <h1>{content.message}</h1>
      {content.submessage && <p className="lead">{content.submessage}</p>}
      <div className="row" style={{ gap: 18, marginTop: 10 }}>
        {canGo && (
          <button className="btn lg primary" onClick={onJump}>
            {content.goLabel || '体験する ▶'}
          </button>
        )}
        <button className="btn lg" onClick={onFinish}>
          {content.stayLabel || 'ここで終わる'}
        </button>
      </div>
    </div>
  );
}
