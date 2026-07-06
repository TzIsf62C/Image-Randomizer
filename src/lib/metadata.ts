import type { ImageRecord } from '../types';

export const UNCATEGORIZED_SET_NAME = 'Uncategorized';

export interface SetOption {
  key: string;
  label: string;
}

export const normalizeSetKey = (setName: string): string => setName.trim().toLowerCase();

export const getRecordSetLabel = (record: { setName?: unknown }): string => {
  if (typeof record.setName !== 'string') return UNCATEGORIZED_SET_NAME;
  const trimmed = record.setName.trim();
  return trimmed || UNCATEGORIZED_SET_NAME;
};

export const extractSetOptions = (records: ImageRecord[]): SetOption[] => {
  const seen = new Map<string, string>();

  records.forEach((record) => {
    const label = getRecordSetLabel(record);
    const key = normalizeSetKey(label);
    if (!seen.has(key)) {
      seen.set(key, label);
    }
  });

  return [...seen.entries()].map(([key, label]) => ({ key, label }));
};

export const loadMetadata = async (): Promise<ImageRecord[]> => {
  const response = await fetch('./metadata/images.json');
  if (!response.ok) {
    throw new Error('Failed to load metadata.');
  }

  const data = (await response.json()) as ImageRecord[];
  return data;
};
