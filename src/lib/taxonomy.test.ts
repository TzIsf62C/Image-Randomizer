import { describe, expect, it } from 'vitest';
import imagesRaw from '../../public/metadata/images.json?raw';
import taxonomyRaw from '../../public/metadata/taxonomy.json?raw';
import type { ImageRecord } from '../types';
import { getRecordSetIds } from './metadata';
import {
  getImagesUsingTaxonomyId,
  getTaxonomyName,
  resolveTaxonomyItems,
  stripTaxonomyId,
  visibleItems, type BuiltInTaxonomy
} from './taxonomy';

describe('built-in taxonomy data', () => {
  const taxonomy = JSON.parse(taxonomyRaw) as BuiltInTaxonomy;
  const images = JSON.parse(imagesRaw) as ImageRecord[];

  it('uses unique slug ids', () => {
    for (const list of [taxonomy.sets, taxonomy.categories]) {
      const ids = list.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
      ids.forEach((id) => expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
    }
  });

  it('defines every set and category referenced by built-in images', () => {
    const setIds = new Set(taxonomy.sets.map((item) => item.id));
    const categoryIds = new Set(taxonomy.categories.map((item) => item.id));

    images.forEach((image) => {
      getRecordSetIds(image).forEach((setId) => expect(setIds, `${image.id} set ${setId}`).toContain(setId));
      (image.categoryIds ?? image.categories ?? []).forEach((categoryId) =>
        expect(categoryIds, `${image.id} category ${categoryId}`).toContain(categoryId)
      );
    });
  });
});

describe('resolveTaxonomyItems', () => {
  const definitions = [
    { id: 'noun', name: 'Noun' },
    { id: 'verb', name: 'Verb' }
  ];
  const stamp = '2026-01-01T00:00:00.000Z';

  it('applies renames and hides deleted built-ins, and appends custom items', () => {
    const items = resolveTaxonomyItems(definitions, [
      { id: 'noun', name: 'Thing', origin: 'native', createdAt: stamp, updatedAt: stamp },
      { id: 'verb', name: 'Verb', origin: 'native', hidden: true, createdAt: stamp, updatedAt: stamp },
      { id: 'category-mine-1', name: 'Mine', origin: 'user', createdAt: stamp, updatedAt: stamp }
    ]);

    expect(items.map((item) => [item.id, item.name, item.hidden])).toEqual([
      ['noun', 'Thing', false],
      ['verb', 'Verb', true],
      ['category-mine-1', 'Mine', false]
    ]);
    expect(items[0].defaultName).toBe('Noun');
    expect(visibleItems(items).map((item) => item.id)).toEqual(['noun', 'category-mine-1']);
    expect(getTaxonomyName(items, 'noun')).toBe('Thing');
    expect(getTaxonomyName(items, 'missing')).toBe('missing');
  });

  it('restores defaults when no override entry exists', () => {
    const items = resolveTaxonomyItems(definitions, []);
    expect(items.map((item) => [item.name, item.hidden])).toEqual([
      ['Noun', false],
      ['Verb', false]
    ]);
  });
});

describe('removing a custom tag from images', () => {
  const rights = { creator: '', copyrightNotice: '', license: '', source: 'user' };
  const record: ImageRecord = {
    id: 'a',
    file: 'a.svg',
    rights,
    setIds: ['set-x', 'meeting-plan-1'],
    setName: 'set-x',
    categoryIds: ['noun', 'category-x'],
    categories: ['noun', 'category-x']
  };

  it('finds images using an id', () => {
    const other: ImageRecord = { id: 'b', file: 'b.svg', rights, setIds: [], categoryIds: ['noun'] };
    expect(getImagesUsingTaxonomyId([record, other], 'categories', 'category-x')).toEqual([record]);
    expect(getImagesUsingTaxonomyId([record, other], 'sets', 'set-x')).toEqual([record]);
  });

  it('strips a category and keeps mirrored fields in sync', () => {
    const next = stripTaxonomyId(record, 'categories', 'category-x');
    expect(next.categoryIds).toEqual(['noun']);
    expect(next.categories).toEqual(['noun']);
  });

  it('strips a set and updates the legacy set name', () => {
    const next = stripTaxonomyId(record, 'sets', 'set-x');
    expect(next.setIds).toEqual(['meeting-plan-1']);
    expect(next.setName).toBe('meeting-plan-1');
  });
});
