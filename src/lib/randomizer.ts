import type { ImageRecord, RepeatMode } from '../types';

export interface RepeatState {
  cycleSeenBySlot: Record<string, string[]>;
  recentBySlot: Record<string, string[]>;
}

const randomPick = <T,>(items: T[]): T => {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
};

export const createInitialRepeatState = (): RepeatState => ({
  cycleSeenBySlot: {},
  recentBySlot: {}
});

export const pickImageForSlot = (
  slotId: string,
  eligible: ImageRecord[],
  repeatMode: RepeatMode,
  avoidLastN: number,
  repeatState: RepeatState
): ImageRecord => {
  if (repeatMode === 'random') {
    return randomPick(eligible);
  }

  if (repeatMode === 'cycle') {
    const seen = repeatState.cycleSeenBySlot[slotId] ?? [];
    const pool = eligible.filter((item) => !seen.includes(item.id));

    if (pool.length === 0) {
      repeatState.cycleSeenBySlot[slotId] = [];
      const selected = randomPick(eligible);
      repeatState.cycleSeenBySlot[slotId] = [selected.id];
      return selected;
    }

    const selected = randomPick(pool);
    repeatState.cycleSeenBySlot[slotId] = [...seen, selected.id];
    return selected;
  }

  const recent = repeatState.recentBySlot[slotId] ?? [];
  const avoided = new Set(recent.slice(-Math.max(0, avoidLastN)));
  const pool = eligible.filter((item) => !avoided.has(item.id));
  const selected = randomPick(pool.length > 0 ? pool : eligible);

  repeatState.recentBySlot[slotId] = [...recent, selected.id];
  return selected;
};
