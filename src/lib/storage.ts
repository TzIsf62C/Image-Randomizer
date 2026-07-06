import { DEFAULT_SETTINGS, STORAGE_KEY } from './constants';
import type { SettingsState } from '../types';

const isValidSettings = (value: unknown): value is SettingsState => {
  if (typeof value !== 'object' || value === null) return false;
  const maybe = value as Partial<SettingsState>;
  return (
    Array.isArray(maybe.selectedSetNames) && maybe.selectedSetNames.every((setName) => typeof setName === 'string') &&
    Array.isArray(maybe.slots) &&
    typeof maybe.soundEnabled === 'boolean' &&
    typeof maybe.animationEnabled === 'boolean' &&
    (maybe.repeatMode === 'random' || maybe.repeatMode === 'cycle' || maybe.repeatMode === 'avoidLastN') &&
    typeof maybe.avoidLastN === 'number' &&
    Array.isArray(maybe.templates)
  );
};

export const loadSettings = (): SettingsState => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isValidSettings(parsed)) {
      return {
        ...DEFAULT_SETTINGS,
        ...parsed
      };
    }
  } catch {
    // Ignore malformed data and fall back to defaults.
  }

  return DEFAULT_SETTINGS;
};

export const saveSettings = (settings: SettingsState): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};
