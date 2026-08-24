import { describe, expect, it } from 'vitest';
import type { ImageRecord } from '../types';
import {
  buildEffectiveMetadata,
  mergeNativeImageOverride,
  createTaxonomyNameKey,
  isDuplicateTaxonomyName,
  resolveAssetUrl
} from './metadata';

describe('mergeNativeImageOverride', () => {
  it('merges bundled native metadata with a user override and preserves native rights', () => {
    const nativeRecord = {
      id: 'cow',
      file: 'mp1/cow.svg',
      setName: 'Meeting Plan 1',
      categories: ['noun', 'animal', 'animate'],
      rights: {
        creator: 'CREATOR NAME',
        copyrightNotice: '© 2026 CREATOR NAME',
        license: 'All rights reserved.',
        source: 'internal'
      }
    };

    const override = {
      imageId: 'cow',
      setIds: ['meeting-plan-1'],
      categoryIds: ['noun', 'animal'],
      excluded: true,
      updatedAt: '2026-08-24T00:00:00.000Z'
    };

    const effective = mergeNativeImageOverride(nativeRecord, override);

    expect(effective.id).toBe('cow');
    expect(effective.origin).toBe('native');
    expect(effective.setIds).toEqual(['meeting-plan-1']);
    expect(effective.categoryIds).toEqual(['noun', 'animal']);
    expect(effective.excluded).toBe(true);
    expect(effective.rights.creator).toBe('CREATOR NAME');
    expect(effective.rights.source).toBe('internal');
  });
});

describe('taxonomy validation helpers', () => {
  it('normalizes and detects duplicate taxonomy names', () => {
    expect(createTaxonomyNameKey(' Animal ')).toBe('animal');
    expect(isDuplicateTaxonomyName(['Animal', 'food'], ' animal ')).toBe(true);
    expect(isDuplicateTaxonomyName(['Animal', 'food'], 'vehicle')).toBe(false);
  });
});

describe('asset URL helpers', () => {
  it('resolves image and metadata asset URLs relative to the current app base', () => {
    const metadataUrl = resolveAssetUrl('./metadata/images.json');
    const imageUrl = resolveAssetUrl('./images/mp1/cow.svg');

    expect(metadataUrl).toContain('/metadata/images.json');
    expect(imageUrl).toContain('/images/mp1/cow.svg');
  });
});

describe('buildEffectiveMetadata', () => {
  it('combines bundled native records, native overrides, and user images into a canonical list', () => {
    const nativeRecords = [
      {
        id: 'cow',
        file: 'mp1/cow.svg',
        setName: 'Meeting Plan 1',
        categories: ['noun', 'animal'],
        rights: {
          creator: 'CREATOR NAME',
          copyrightNotice: '© 2026 CREATOR NAME',
          license: 'All rights reserved.',
          source: 'internal'
        }
      }
    ];

    const overrides = [
      {
        imageId: 'cow',
        setIds: ['meeting-plan-1'],
        categoryIds: ['noun'],
        excluded: true,
        updatedAt: '2026-08-24T00:00:00.000Z'
      }
    ];

    const userImages: ImageRecord[] = [
      {
        id: 'user-1',
        file: 'custom.png',
        setIds: ['farm-vocabulary'],
        categoryIds: ['animal'],
        rights: {
          creator: 'Me',
          copyrightNotice: '© 2026 Me',
          license: 'CC BY',
          source: 'user'
        },
        origin: 'user',
        excluded: false,
        blobKey: 'blob-1'
      }
    ];

    const effective = buildEffectiveMetadata(nativeRecords, overrides, userImages);

    expect(effective).toHaveLength(2);
    expect(effective.find((record) => record.id === 'cow')?.excluded).toBe(true);
    expect(effective.find((record) => record.id === 'user-1')?.origin).toBe('user');
  });
});

describe('restore native override behavior', () => {
  it('removes only the selected native override while keeping others intact', () => {
    const overrides = [
      { imageId: 'cow', categoryIds: ['noun'], setIds: ['meeting-plan-1'], excluded: true },
      { imageId: 'bird', categoryIds: ['animal'], setIds: ['meeting-plan-1'], excluded: false }
    ];

    const nextOverrides = overrides.filter((override) => override.imageId !== 'cow');

    expect(nextOverrides).toHaveLength(1);
    expect(nextOverrides[0]?.imageId).toBe('bird');
  });
});
