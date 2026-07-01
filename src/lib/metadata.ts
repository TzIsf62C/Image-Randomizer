import type { ImageRecord } from '../types';

export const loadMetadata = async (): Promise<ImageRecord[]> => {
  const response = await fetch('./metadata/images.json');
  if (!response.ok) {
    throw new Error('Failed to load metadata.');
  }

  const data = (await response.json()) as ImageRecord[];
  return data;
};
