export type RepeatMode = 'random' | 'cycle' | 'avoidLastN';
export type ImageOrigin = 'native' | 'user';

export interface ImageRights {
  creator: string;
  copyrightNotice: string;
  license: string;
  source: string;
}

export interface ImageRecord {
  id: string;
  file: string;
  origin?: ImageOrigin;
  setName?: string;
  setIds?: string[];
  categories?: string[];
  categoryIds?: string[];
  rights: ImageRights;
  excluded?: boolean;
  createdAt?: string;
  updatedAt?: string;
  blobKey?: string;
  fileName?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  bytes?: number;
  blob?: Blob;
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
  selectedSetNames: string[];
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
