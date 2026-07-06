import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { HistoryModal } from '../components/HistoryModal';
import { SlotReel } from '../components/SlotReel';
import { CloseIcon, HistoryIcon, SettingsIcon, SpinIcon } from '../components/icons';
import { SPIN_DURATION_MS } from '../lib/constants';
import { getRecordSetLabel, normalizeSetKey } from '../lib/metadata';
import { pickImageForSlot, type RepeatState } from '../lib/randomizer';
import type { ImageRecord, SettingsState, SpinResult } from '../types';

interface PracticePageProps {
  settings: SettingsState;
  metadata: ImageRecord[];
  repeatState: RepeatState;
}

interface SpinSfxTiming {
  reelCount: number;
  animationEnabled: boolean;
  reelStaggerMs: number;
  reelHoldMs: number;
  reelBlurMs: number;
}

interface SpinAudioEngine {
  context: AudioContext;
  noiseBuffer: AudioBuffer;
}

const NOISE_BUFFER_SECONDS = 0.7;

const createNoiseBuffer = (context: AudioContext): AudioBuffer => {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * NOISE_BUFFER_SECONDS));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < frameCount; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  return buffer;
};

const getAudioEngine = (engineRef: React.MutableRefObject<SpinAudioEngine | null>): SpinAudioEngine => {
  if (engineRef.current) return engineRef.current;

  const context = new AudioContext();
  const noiseBuffer = createNoiseBuffer(context);
  engineRef.current = { context, noiseBuffer };
  return engineRef.current;
};

const playSpinSound = (
  engineRef: React.MutableRefObject<SpinAudioEngine | null>,
  timing: SpinSfxTiming
): void => {
  const { context, noiseBuffer } = getAudioEngine(engineRef);

  void context.resume();

  const startAt = context.currentTime + 0.008;
  const blurDurationSeconds = timing.animationEnabled ? timing.reelBlurMs / 1000 : 0;
  const blurStartSeconds = timing.animationEnabled ? timing.reelHoldMs / 1000 : 0;
  const whooshStartAt = startAt + blurStartSeconds;
  const attackSeconds = Math.min(0.03, blurDurationSeconds * 0.35);
  const releaseSeconds = 0.07;
  const minWhooshSeconds = 0.09;
  const whooshDurationSeconds = Math.max(blurDurationSeconds, minWhooshSeconds);
  const whooshEndAt = whooshStartAt + whooshDurationSeconds;
  const releaseStartAt = Math.max(whooshStartAt + attackSeconds, whooshEndAt - releaseSeconds);

  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.3;

  const gain = context.createGain();

  const baseGain = 0.00001;
  gain.gain.setValueAtTime(baseGain, whooshStartAt);
  gain.gain.exponentialRampToValueAtTime(0.05, whooshStartAt + attackSeconds);
  gain.gain.setValueAtTime(0.05, releaseStartAt);
  gain.gain.exponentialRampToValueAtTime(baseGain, whooshEndAt);

  const filterStartFreq = 540;
  const filterPeakFreq = 2000;
  filter.frequency.setValueAtTime(filterStartFreq, whooshStartAt);
  filter.frequency.exponentialRampToValueAtTime(filterPeakFreq, whooshStartAt + Math.max(attackSeconds, 0.01));
  filter.frequency.exponentialRampToValueAtTime(900, whooshEndAt);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);

  noise.start(whooshStartAt);
  noise.stop(whooshEndAt + 0.02);

  const clickBaseAt =
    startAt +
    (timing.animationEnabled ? (timing.reelHoldMs + timing.reelBlurMs) / 1000 : 0.012);

  for (let reelIndex = 0; reelIndex < timing.reelCount; reelIndex += 1) {
    const clickAt = clickBaseAt + (timing.animationEnabled ? (reelIndex * timing.reelStaggerMs) / 1000 : 0);
    const clickOscillator = context.createOscillator();
    const clickGain = context.createGain();

    clickOscillator.type = 'triangle';
    clickOscillator.frequency.setValueAtTime(1600, clickAt);
    clickOscillator.frequency.exponentialRampToValueAtTime(900, clickAt + 0.014);

    clickGain.gain.setValueAtTime(0.00001, clickAt);
    clickGain.gain.exponentialRampToValueAtTime(0.03, clickAt + 0.004);
    clickGain.gain.exponentialRampToValueAtTime(0.00001, clickAt + 0.028);

    clickOscillator.connect(clickGain);
    clickGain.connect(context.destination);

    clickOscillator.start(clickAt);
    clickOscillator.stop(clickAt + 0.03);
  }
};

const buildEligibility = (records: ImageRecord[], selectedSetNames: string[]): ImageRecord[] => {
  const selectedSetKeys = new Set(selectedSetNames.map((setName) => normalizeSetKey(setName)));
  return records.filter((record) => selectedSetKeys.has(normalizeSetKey(getRecordSetLabel(record))));
};

export const PracticePage = ({ settings, metadata, repeatState }: PracticePageProps) => {
  const REEL_STAGGER_MS = 90;
  const REEL_HOLD_MS = 80;

  const navigate = useNavigate();
  const [spinning, setSpinning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [current, setCurrent] = useState<(ImageRecord | null)[]>(() => settings.slots.map(() => null));
  const [history, setHistory] = useState<SpinResult[]>([]);
  const [activeImage, setActiveImage] = useState<ImageRecord | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const spinCounterRef = useRef(0);
  const audioEngineRef = useRef<SpinAudioEngine | null>(null);

  const REEL_SETTLE_MS = prefersReducedMotion ? 120 : 160;
  const REEL_BLUR_MS = prefersReducedMotion ? 0 : Math.max(SPIN_DURATION_MS - REEL_HOLD_MS - REEL_SETTLE_MS, 0);
  const REEL_TOTAL_MS = REEL_HOLD_MS + REEL_BLUR_MS + REEL_SETTLE_MS;

  const eligibleBySlot = useMemo(() => {
    const bySet = buildEligibility(metadata, settings.selectedSetNames);
    return settings.slots.map((slot) => bySet.filter((item) => item.categories.includes(slot.category)));
  }, [metadata, settings.selectedSetNames, settings.slots]);

  const hasConfigError =
    settings.selectedSetNames.length === 0 || eligibleBySlot.some((eligible) => eligible.length === 0);

  const spin = useCallback((): void => {
    if (spinning || hasConfigError) return;

    setSpinning(true);

    if (settings.soundEnabled) {
      playSpinSound(audioEngineRef, {
        reelCount: settings.slots.length,
        animationEnabled: settings.animationEnabled,
        reelStaggerMs: REEL_STAGGER_MS,
        reelHoldMs: REEL_HOLD_MS,
        reelBlurMs: REEL_BLUR_MS
      });
    }

    const selected = settings.slots.map((slot, index) => {
      return pickImageForSlot(
        slot.id,
        eligibleBySlot[index],
        settings.repeatMode,
        settings.avoidLastN,
        repeatState
      );
    });

    const finalize = () => {
      spinCounterRef.current += 1;
      setHistory((previous) => [
        ...previous,
        {
          spinNumber: spinCounterRef.current,
          records: selected
        }
      ]);
      setSpinning(false);
    };

    if (settings.animationEnabled) {
      selected.forEach((record, index) => {
        const swapDelayMs = index * REEL_STAGGER_MS + REEL_HOLD_MS + REEL_BLUR_MS;
        window.setTimeout(() => {
          setCurrent((previous) => {
            const next = [...previous];
            next[index] = record;
            return next;
          });
        }, swapDelayMs);
      });

      const finalDelayMs = Math.max(selected.length - 1, 0) * REEL_STAGGER_MS + REEL_TOTAL_MS;
      window.setTimeout(finalize, finalDelayMs);
    } else {
      setCurrent(selected);
      finalize();
    }
  }, [REEL_BLUR_MS, REEL_HOLD_MS, REEL_STAGGER_MS, REEL_TOTAL_MS, eligibleBySlot, hasConfigError, repeatState, settings.animationEnabled, settings.avoidLastN, settings.repeatMode, settings.slots, settings.soundEnabled, spinning]);

  useEffect(() => {
    return () => {
      const engine = audioEngineRef.current;
      if (!engine) return;
      void engine.context.close();
      audioEngineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (): void => setPrefersReducedMotion(mediaQuery.matches);

    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Space') {
        event.preventDefault();
        if (!spinning) spin();
      }
      if (event.key.toLowerCase() === 'h') {
        setShowHistory(true);
      }
      if (event.key.toLowerCase() === 's') {
        navigate('/settings');
      }
      if (event.key === 'Escape') {
        setShowHistory(false);
        setActiveImage(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, spin, spinning]);

  const [isPortrait, setIsPortrait] = useState(() => window.matchMedia('(orientation: portrait)').matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(orientation: portrait)');
    const update = (): void => setIsPortrait(mediaQuery.matches);
    update();

    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  if (isPortrait) {
    return (
      <main className="rotate-screen" aria-live="polite">
        <p>Rotate device to landscape</p>
      </main>
    );
  }

  const reelSectionStyle = {
    '--slot-count': Math.max(current.length, 1)
  } as CSSProperties;

  return (
    <main className="practice-screen">
      {showHistory ? <HistoryModal history={history} onClose={() => setShowHistory(false)} /> : null}

      <section className="reels" aria-live="polite" style={reelSectionStyle}>
        {current.map((record, index) => (
          <SlotReel
            key={settings.slots[index].id}
            record={record}
            spinning={spinning}
            stopDelayMs={index * REEL_STAGGER_MS}
            animationEnabled={settings.animationEnabled}
            prefersReducedMotion={prefersReducedMotion}
            onOpenImage={setActiveImage}
          />
        ))}
      </section>

      {activeImage ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${activeImage.id} image details`}
          onClick={() => setActiveImage(null)}
        >
          <article className="image-preview-modal" onClick={(event) => event.stopPropagation()}>
            <button
              className="icon-button image-preview-close"
              type="button"
              onClick={() => setActiveImage(null)}
              aria-label="Close image details"
            >
              <CloseIcon />
            </button>

            <div className="image-preview-content">
              <img src={`./images/${activeImage.file}`} alt={activeImage.id} className="image-preview-large" loading="eager" />

              <aside className="image-rights-footer">
                <p>{activeImage.rights.copyrightNotice}</p>
                <p>{activeImage.rights.license}</p>
              </aside>
            </div>
          </article>
        </div>
      ) : null}

      <nav className="practice-controls" aria-label="Practice controls">
        <button className="icon-button spin" type="button" onClick={spin} disabled={spinning || hasConfigError} aria-label="Spin">
          <SpinIcon />
        </button>
        <button className="icon-button" type="button" onClick={() => setShowHistory(true)} aria-label="History">
          <HistoryIcon />
        </button>
        <button className="icon-button" type="button" onClick={() => navigate('/settings')} aria-label="Settings">
          <SettingsIcon />
        </button>
      </nav>
    </main>
  );
};
