export type RepeatMode = 'random' | 'cycle' | 'avoidLastN';

export interface ImageRecord {
  id: string;
  file: string;
  lesson: number;
  categories: string[];
  rights: {
    creator: string;
    copyrightNotice: string;
    license: string;
    source: string;
  };
}

export interface SlotConfig {
  id: string;
  label: string;
  category: string;
}

export interface SlotTemplate {
  id: string;
  name: string;
  slots: SlotConfig[];
}

export interface SettingsState {
  selectedLessons: number[];
  slots: SlotConfig[];
  soundEnabled: boolean;
  animationEnabled: boolean;
  repeatMode: RepeatMode;
  avoidLastN: number;
  templates: SlotTemplate[];
}

export interface SpinResult {
  spinNumber: number;
  records: ImageRecord[];
}
