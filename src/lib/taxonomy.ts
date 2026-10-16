import type { ImageRecord } from '../types';
import { resolveAssetUrl } from './metadata';
import {
  deleteTaxonomyEntry,
  listTaxonomyEntries,
  saveNativeImageOverride,
  saveTaxonomyEntry,
  saveUserImage,
  type TaxonomyEntry
} from './userStorage';

export type TaxonomyKind = 'categories' | 'sets';

export interface TaxonomyDefinition {
  id: string;
  name: string;
}

export interface BuiltInTaxonomy {
  sets: TaxonomyDefinition[];
  categories: TaxonomyDefinition[];
}

export interface TaxonomyItem {
  id: string;
  name: string;
  builtin: boolean;
  hidden: boolean;
  defaultName?: string;
}

export interface Taxonomy {
  sets: TaxonomyItem[];
  categories: TaxonomyItem[];
}

export const EMPTY_TAXONOMY: Taxonomy = { sets: [], categories: [] };

/** Merges built-in definitions with stored entries: native entries are per-id overrides, user entries are custom items. */
export const resolveTaxonomyItems = (
  definitions: TaxonomyDefinition[],
  entries: TaxonomyEntry[]
): TaxonomyItem[] => {
  const overrides = new Map(entries.filter((entry) => entry.origin === 'native').map((entry) => [entry.id, entry]));

  const builtIn = definitions.map((definition) => {
    const override = overrides.get(definition.id);
    return {
      id: definition.id,
      name: override?.name || definition.name,
      builtin: true,
      hidden: Boolean(override?.hidden),
      defaultName: definition.name
    } satisfies TaxonomyItem;
  });

  const custom = entries
    .filter((entry) => entry.origin === 'user')
    .map((entry) => ({ id: entry.id, name: entry.name, builtin: false, hidden: false }) satisfies TaxonomyItem);

  return [...builtIn, ...custom];
};

export const visibleItems = (items: TaxonomyItem[]): TaxonomyItem[] => items.filter((item) => !item.hidden);

export const getTaxonomyName = (items: TaxonomyItem[], id: string): string =>
  items.find((item) => item.id === id)?.name ?? id;

export const loadBuiltInTaxonomy = async (): Promise<BuiltInTaxonomy> => {
  const response = await fetch(resolveAssetUrl('./metadata/taxonomy.json'));
  if (!response.ok) {
    throw new Error('Failed to load taxonomy.');
  }
  return (await response.json()) as BuiltInTaxonomy;
};

export const loadTaxonomy = async (): Promise<Taxonomy> => {
  const [builtIn, storedCategories, storedSets] = await Promise.all([
    loadBuiltInTaxonomy(),
    listTaxonomyEntries('categories'),
    listTaxonomyEntries('sets')
  ]);

  return {
    categories: resolveTaxonomyItems(builtIn.categories, storedCategories),
    sets: resolveTaxonomyItems(builtIn.sets, storedSets)
  };
};

const findEntry = async (kind: TaxonomyKind, id: string): Promise<TaxonomyEntry | undefined> =>
  (await listTaxonomyEntries(kind)).find((entry) => entry.id === id);

export const renameTaxonomyItem = async (kind: TaxonomyKind, item: TaxonomyItem, name: string): Promise<void> => {
  const existing = await findEntry(kind, item.id);
  const now = new Date().toISOString();

  await saveTaxonomyEntry(
    {
      id: item.id,
      origin: item.builtin ? 'native' : 'user',
      createdAt: existing?.createdAt ?? now,
      hidden: existing?.hidden,
      name,
      updatedAt: now
    },
    kind
  );
};

const getRecordTagIds = (record: ImageRecord, kind: TaxonomyKind): string[] =>
  kind === 'sets' ? (record.setIds ?? []) : (record.categoryIds ?? record.categories ?? []);

export const getImagesUsingTaxonomyId = (records: ImageRecord[], kind: TaxonomyKind, id: string): ImageRecord[] =>
  records.filter((record) => getRecordTagIds(record, kind).includes(id));

/** Returns the record without the given tag id, keeping the legacy mirrored fields in sync. */
export const stripTaxonomyId = (record: ImageRecord, kind: TaxonomyKind, id: string): ImageRecord => {
  const remaining = getRecordTagIds(record, kind).filter((value) => value !== id);

  if (kind === 'sets') {
    return { ...record, setIds: remaining, setName: remaining[0] };
  }
  return { ...record, categoryIds: remaining, categories: remaining };
};

const removeTagFromImages = async (records: ImageRecord[], kind: TaxonomyKind, id: string): Promise<void> => {
  const updatedAt = new Date().toISOString();

  for (const record of getImagesUsingTaxonomyId(records, kind, id)) {
    const next = stripTaxonomyId(record, kind, id);

    if (record.origin === 'native') {
      await saveNativeImageOverride({
        imageId: record.id,
        setIds: next.setIds ?? [],
        categoryIds: next.categoryIds ?? [],
        excluded: Boolean(record.excluded),
        updatedAt
      });
    } else {
      await saveUserImage({ ...next, blob: undefined, updatedAt });
    }
  }
};

/** Built-in items are hidden so they can be restored later; custom items are removed along with their image tags. */
export const removeTaxonomyItem = async (
  kind: TaxonomyKind,
  item: TaxonomyItem,
  records: ImageRecord[] = []
): Promise<void> => {
  if (!item.builtin) {
    await removeTagFromImages(records, kind, item.id);
    await deleteTaxonomyEntry(kind, item.id);
    return;
  }

  const existing = await findEntry(kind, item.id);
  const now = new Date().toISOString();
  await saveTaxonomyEntry(
    {
      id: item.id,
      origin: 'native',
      name: existing?.name ?? item.name,
      hidden: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    },
    kind
  );
};

/** Clears the stored override so a built-in item returns to its default name and visibility. */
export const restoreTaxonomyItem = async (kind: TaxonomyKind, item: TaxonomyItem): Promise<void> => {
  if (!item.builtin) return;
  await deleteTaxonomyEntry(kind, item.id);
};
