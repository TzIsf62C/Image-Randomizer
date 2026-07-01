import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const navigate = useNavigate();
  const [spinning, setSpinning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [current, setCurrent] = useState<(ImageRecord | null)[]>(() => settings.slots.map(() => null));
  const [history, setHistory] = useState<SpinResult[]>([]);
  const spinCounterRef = useRef(0);

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
      setCurrent(selected);
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
      window.setTimeout(finalize, SPIN_DURATION_MS);
    } else {
      finalize();
    }
  }, [eligibleBySlot, hasConfigError, repeatState, settings.animationEnabled, settings.avoidLastN, settings.repeatMode, settings.slots, settings.soundEnabled, spinning]);

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

  return (
    <main className="practice-screen">
      {showHistory ? <HistoryModal history={history} onClose={() => setShowHistory(false)} /> : null}

      <section className="reels" aria-live="polite">
        {current.map((record, index) => (
          <SlotReel
            key={settings.slots[index].id}
            record={record}
            spinning={spinning}
            stopDelayMs={index * 90}
            animationEnabled={settings.animationEnabled}
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
