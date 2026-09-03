import type { ImageRecord } from '../types';

export const UNCATEGORIZED_SET_NAME = 'Uncategorized';

export interface SetOption {
  key: string;
  label: string;
}

export interface NativeImageOverride {
  imageId: string;
  setIds?: string[];
  categoryIds?: string[];
  excluded?: boolean;
  updatedAt?: string;
}

const normalizeStringList = (values?: string[]): string[] => {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  values.forEach((value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    normalized.push(trimmed);
  });

  return normalized;
};

export const createTaxonomyNameKey = (name: string): string => name.trim().toLowerCase();

export const isDuplicateTaxonomyName = (existingNames: string[], candidateName: string): boolean => {
  const key = createTaxonomyNameKey(candidateName);
  return existingNames.some((existingName) => createTaxonomyNameKey(existingName) === key);
};

export const normalizeTaxonomyName = (name: string): string => name.trim();

export const normalizeSetKey = (setName: string): string =>
  setName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const resolveAssetUrl = (assetPath: string): string => {
  const trimmed = assetPath.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^(?:[a-z]+:)?\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  if (typeof window === 'undefined') {
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  const base = document.baseURI || window.location.href;
  return new URL(trimmed.replace(/^\.?\//, ''), base).toString();
};

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

export const mergeNativeImageOverride = (
  nativeRecord: ImageRecord,
  override?: NativeImageOverride
): ImageRecord => {
  const nativeCategoryIds = normalizeStringList(nativeRecord.categoryIds ?? nativeRecord.categories);
  const baseCategoryIds = normalizeStringList(override?.categoryIds ?? nativeCategoryIds);
  const baseSetIds = normalizeStringList(
    override?.setIds ?? nativeRecord.setIds ?? (nativeRecord.setName ? [normalizeSetKey(nativeRecord.setName)] : [])
  );

  return {
    ...nativeRecord,
    origin: 'native',
    categories: baseCategoryIds,
    categoryIds: baseCategoryIds,
    setName: nativeRecord.setName ?? UNCATEGORIZED_SET_NAME,
    setIds: baseSetIds,
    excluded: override?.excluded ?? nativeRecord.excluded ?? false,
    updatedAt: override?.updatedAt ?? nativeRecord.updatedAt ?? new Date().toISOString()
  };
};

export const buildEffectiveMetadata = (
  nativeRecords: ImageRecord[],
  nativeOverrides: NativeImageOverride[] = [],
  userImages: ImageRecord[] = []
): ImageRecord[] => {
  const overrideByImageId = new Map(nativeOverrides.map((override) => [override.imageId, override]));

  const mergedNative = nativeRecords.map((record) => {
    const override = overrideByImageId.get(record.id);
    return mergeNativeImageOverride(record, override);
  });

  const mergedUser = userImages.map((record) => {
    const categoryIds = normalizeStringList(record.categoryIds ?? record.categories);
    const setIds = normalizeStringList(record.setIds ?? (record.setName ? [record.setName] : []));

    return {
      ...record,
      origin: 'user' as const,
      categories: categoryIds,
      categoryIds,
      setIds,
      excluded: record.excluded ?? false,
      updatedAt: record.updatedAt ?? new Date().toISOString()
    } satisfies ImageRecord;
  });

  return [...mergedNative, ...mergedUser] as ImageRecord[];
};

export const loadMetadata = async (): Promise<ImageRecord[]> => {
  const response = await fetch(resolveAssetUrl('./metadata/images.json'));
  if (!response.ok) {
    throw new Error('Failed to load metadata.');
  }

  const data = (await response.json()) as ImageRecord[];
  return data.map((record) => mergeNativeImageOverride(record));
};
