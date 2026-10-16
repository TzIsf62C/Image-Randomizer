import type { SettingsState } from '../types';
import { generateUuid } from './uuid';

export const STORAGE_KEY = 'language-slot-machine-settings-v1';

export const DEFAULT_SETTINGS: SettingsState = {
  selectedSetIds: ['meeting-plan-1', 'meeting-plan-2', 'meeting-plan-3', 'meeting-plan-4'],
  slots: [
    { id: generateUuid(), label: 'Subject', category: ['animate'] },
    { id: generateUuid(), label: 'Verb', category: ['transitive-verb'] },
    { id: generateUuid(), label: 'Object', category: ['concrete-object'] }
  ],
  soundEnabled: false,
  animationEnabled: true,
  repeatMode: 'cycle',
  avoidLastN: 3,
  templates: []
};

export const SPIN_DURATION_MS = 940;
