import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { HistoryModal } from '../components/HistoryModal';
import { SlotReel } from '../components/SlotReel';
import { HistoryIcon, SettingsIcon, SpinIcon } from '../components/icons';
import { SPIN_DURATION_MS } from '../lib/constants';
import { pickImageForSlot, type RepeatState } from '../lib/randomizer';
import type { ImageRecord, SettingsState, SpinResult } from '../types';

interface PracticePageProps {
  settings: SettingsState;
  metadata: ImageRecord[];
  repeatState: RepeatState;
}

const buildEligibility = (records: ImageRecord[], selectedLessons: number[]): ImageRecord[] => {
  const lessonSet = new Set(selectedLessons);
  return records.filter((record) => lessonSet.has(record.lesson));
};

export const PracticePage = ({ settings, metadata, repeatState }: PracticePageProps) => {
  const REEL_STAGGER_MS = 90;
  const REEL_HOLD_MS = 80;

  const navigate = useNavigate();
  const [spinning, setSpinning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [current, setCurrent] = useState<(ImageRecord | null)[]>(() => settings.slots.map(() => null));
  const [history, setHistory] = useState<SpinResult[]>([]);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const spinCounterRef = useRef(0);

  const REEL_SETTLE_MS = prefersReducedMotion ? 120 : 160;
  const REEL_BLUR_MS = prefersReducedMotion ? 0 : Math.max(SPIN_DURATION_MS - REEL_HOLD_MS - REEL_SETTLE_MS, 0);
  const REEL_TOTAL_MS = REEL_HOLD_MS + REEL_BLUR_MS + REEL_SETTLE_MS;

  const eligibleBySlot = useMemo(() => {
    const byLesson = buildEligibility(metadata, settings.selectedLessons);
    return settings.slots.map((slot) => byLesson.filter((item) => item.categories.includes(slot.category)));
  }, [metadata, settings.selectedLessons, settings.slots]);

  const hasConfigError =
    settings.selectedLessons.length === 0 || eligibleBySlot.some((eligible) => eligible.length === 0);

  const spin = useCallback((): void => {
    if (spinning || hasConfigError) return;

    setSpinning(true);

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

      if (settings.soundEnabled) {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.value = 660;
        oscillator.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.06);
      }
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
          />
        ))}
      </section>

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
