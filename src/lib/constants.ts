import type { SettingsState } from '../types';

export const STORAGE_KEY = 'language-slot-machine-settings-v1';

export const DEFAULT_SETTINGS: SettingsState = {
  selectedLessons: [1,2,3,4],
  slots: [
    { id: crypto.randomUUID(), label: 'Subject', category: 'animate' },
    { id: crypto.randomUUID(), label: 'Verb', category: 'transitive-verb' },
    { id: crypto.randomUUID(), label: 'Object', category: 'concrete-object' }
  ],
  soundEnabled: false,
  animationEnabled: true,
  repeatMode: 'cycle',
  avoidLastN: 3,
  templates: []
};

export const SPIN_DURATION_MS = 940;
