import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { SPIN_DURATION_MS } from '../lib/constants';
import type { ImageRecord } from '../types';
import { InfoIcon } from './icons';

interface SlotReelProps {
  record: ImageRecord | null;
  spinning: boolean;
  stopDelayMs: number;
  animationEnabled: boolean;
  prefersReducedMotion: boolean;
  onOpenImage: (record: ImageRecord) => void;
}

export const SlotReel = ({
  record,
  spinning,
  stopDelayMs,
  animationEnabled,
  prefersReducedMotion,
  onOpenImage
}: SlotReelProps) => {
  const HOLD_MS = 80;
  const SETTLE_MS = prefersReducedMotion ? 120 : 160;
  const MOTION_BLUR_MS = Math.max(SPIN_DURATION_MS - HOLD_MS - SETTLE_MS, 0);
  const [isSpinningPhase, setIsSpinningPhase] = useState(false);
  const [isMotionBlur, setIsMotionBlur] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  useEffect(() => {
    if (!animationEnabled || !spinning) {
      setIsSpinningPhase(false);
      setIsMotionBlur(false);
      setIsSettling(false);
      return;
    }

    const startTimer = window.setTimeout(() => {
      setIsSpinningPhase(true);
      setIsMotionBlur(false);
      setIsSettling(false);
    }, stopDelayMs);

    const blurTimer = window.setTimeout(() => {
      if (!prefersReducedMotion) {
        setIsMotionBlur(true);
      }
    }, stopDelayMs + HOLD_MS);

    const settleTimer = window.setTimeout(() => {
      setIsMotionBlur(false);
      setIsSettling(true);
    }, stopDelayMs + HOLD_MS + MOTION_BLUR_MS);

    const endTimer = window.setTimeout(() => {
      setIsSettling(false);
      setIsSpinningPhase(false);
    }, stopDelayMs + HOLD_MS + MOTION_BLUR_MS + SETTLE_MS);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(blurTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(endTimer);
    };
  }, [MOTION_BLUR_MS, SETTLE_MS, animationEnabled, prefersReducedMotion, spinning, stopDelayMs]);

  const trackClassName = useMemo(() => {
    const classes = ['reel-track'];
    if (isSpinningPhase) classes.push('spinning');
    if (isMotionBlur) classes.push('motion-blur');
    if (isSettling) classes.push('settling');
    return classes.join(' ');
  }, [isMotionBlur, isSettling, isSpinningPhase]);

  const renderSymbol = (key: string) => (
    <div key={key} className="symbol">
      {record ? (
        <button
          type="button"
          className="reel-image-button"
          onClick={() => onOpenImage(record)}
          aria-label={`Open ${record.id} image details`}
        >
          <img
            src={`./images/${record.file}`}
            alt=""
            role="presentation"
            className="reel-image"
            loading="eager"
            onError={(event) => {
              event.currentTarget.classList.add('image-error');
            }}
          />
        </button>
      ) : (
        <div className="placeholder" />
      )}
    </div>
  );

  return (
    <div className="reel-window">
      <button
        type="button"
        className="reel-info-button"
        onClick={() => {
          if (record) {
            onOpenImage(record);
          }
        }}
        aria-label={record ? `Open ${record.id} image details` : 'No image selected'}
        disabled={!record}
      >
        <InfoIcon />
      </button>
      <div className={trackClassName}>
        {renderSymbol('symbol-top')}
        {renderSymbol('symbol-middle')}
        {renderSymbol('symbol-bottom')}

        <div className="motion-blur-layer" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={`blur-${index}`} className="blur-clone" style={{ '--blur-index': index } as CSSProperties}>
              {record ? (
                <img src={`./images/${record.file}`} alt="" role="presentation" className="reel-image" loading="eager" />
              ) : (
                <div className="placeholder" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
