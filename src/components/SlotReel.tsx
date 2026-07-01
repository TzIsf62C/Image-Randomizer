import type { ImageRecord } from '../types';

interface SlotReelProps {
  record: ImageRecord | null;
  spinning: boolean;
  stopDelayMs: number;
  animationEnabled: boolean;
}

export const SlotReel = ({ record, spinning, stopDelayMs, animationEnabled }: SlotReelProps) => {
  const shouldAnimate = spinning && animationEnabled;
  const trackStyle = shouldAnimate ? { animationDelay: `${stopDelayMs}ms` } : undefined;

  return (
    <div className="reel-window">
      <div className={shouldAnimate ? 'reel-track spinning' : 'reel-track'} style={trackStyle}>
        {record ? (
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
        ) : (
          <div className="placeholder" />
        )}
      </div>
    </div>
  );
};
