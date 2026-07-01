import type { SettingsState } from '../types';

export const STORAGE_KEY = 'language-slot-machine-settings-v1';

export const DEFAULT_SETTINGS: SettingsState = {
  selectedLessons: [1],
  slots: [
    { id: crypto.randomUUID(), label: 'Subject', category: 'subject' },
    { id: crypto.randomUUID(), label: 'Verb', category: 'verb' }
  ],
  soundEnabled: false,
  animationEnabled: true,
  repeatMode: 'random',
  avoidLastN: 3,
  templates: []
};

export const SPIN_DURATION_MS = 500;
