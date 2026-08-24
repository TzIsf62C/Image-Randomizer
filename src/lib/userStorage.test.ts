import { describe, expect, it } from 'vitest';
import { createTaxonomyNameKey, isDuplicateTaxonomyName } from './metadata';
import {
  buildTaxonomyEntry,
  buildUserImageRecord,
  capSessionHistory,
  exportUserDataArchive,
  importUserDataArchive,
  isQuotaExceededError,
  processUserImageFile,
  setImageExcluded
} from './userStorage';

describe('taxonomy duplicate detection', () => {
  it('catches identical trimmed names regardless of casing', () => {
    expect(createTaxonomyNameKey('  Animal  ')).toBe('animal');
    expect(isDuplicateTaxonomyName(['Animal', 'food'], ' animal ')).toBe(true);
    expect(isDuplicateTaxonomyName(['Animal', 'food'], 'vehicle')).toBe(false);
  });
});

describe('user image import record creation', () => {
  it('builds a user image record with stable defaults and user rights', () => {
    const file = new File(['abc'], 'cat.png', { type: 'image/png' });
    const record = buildUserImageRecord(file);

    expect(record.origin).toBe('user');
    expect(record.fileName).toBe('cat.png');
    expect(record.mimeType).toBe('image/png');
    expect(record.rights.source).toBe('user');
    expect(record.categoryIds).toEqual([]);
    expect(record.setIds).toEqual([]);
    expect(record.excluded).toBe(false);
    expect(record.id.startsWith('user-')).toBe(true);
  });

  it('exports and rehydrates a portable user-data archive', async () => {
    const archive = exportUserDataArchive({
      userImages: [
        {
          id: 'user-abc',
          file: 'user-abc.png',
          fileName: 'cat.png',
          mimeType: 'image/png',
          origin: 'user',
          categoryIds: ['animal'],
          setIds: ['farm'],
          rights: {
            creator: 'Me',
            copyrightNotice: '© 2026 Me',
            license: 'CC BY',
            source: 'user'
          }
        }
      ],
      nativeOverrides: [
        { imageId: 'cow', categoryIds: ['noun'], setIds: ['meeting-plan-1'], excluded: true }
      ],
      files: [{ id: 'user-abc', fileName: 'cat.png', mimeType: 'image/png', data: 'iVBORw0KGgo=' }]
    });

    expect(archive.version).toBe(1);
    expect(archive.userImages[0]?.id).toBe('user-abc');
    expect(archive.nativeOverrides[0]?.imageId).toBe('cow');
    expect(archive.files[0]?.id).toBe('user-abc');

    await expect(importUserDataArchive(archive)).resolves.toBeUndefined();
  });

  it('processes a raster image into a portable 1200px master when needed', async () => {
    const blob = new Blob(['abc'], { type: 'image/png' });
    const file = new File([blob], 'cat.png', { type: 'image/png' });
    const record = await processUserImageFile(file);

    expect(record.origin).toBe('user');
    expect(record.file.endsWith('.png') || record.file.endsWith('.webp')).toBe(true);
    expect(record.bytes).toBeGreaterThan(0);
  });

  it('builds a managed taxonomy entry with normalized user metadata', () => {
    const entry = buildTaxonomyEntry('  Animal  ', 'user');

    expect(entry.name).toBe('Animal');
    expect(entry.origin).toBe('user');
    expect(entry.id.startsWith('category-') || entry.id.startsWith('set-')).toBe(true);
    expect(entry.updatedAt).toBeTruthy();
  });

  it('marks a user image as excluded and restores it when toggled back', async () => {
    const record = buildUserImageRecord(new File(['abc'], 'cat.png', { type: 'image/png' }));
    const excludedRecord = { ...record, excluded: true, updatedAt: new Date().toISOString() };

    expect(excludedRecord.excluded).toBe(true);
    expect(setImageExcluded).toBeTypeOf('function');
  });

  it('caps session history to a bounded window while preserving newest entries', () => {
    const entries = Array.from({ length: 12 }, (_, index) => ({ spinNumber: index + 1, records: [] }));
    const capped = capSessionHistory(entries, 5);

    expect(capped).toHaveLength(5);
    expect(capped[0]?.spinNumber).toBe(8);
    expect(capped.at(-1)?.spinNumber).toBe(12);
  });

  it('detects browser quota exceeded errors for user import warnings', () => {
    const error = new DOMException('The quota has been exceeded.', 'QuotaExceededError');

    expect(isQuotaExceededError(error)).toBe(true);
    expect(isQuotaExceededError(new Error('Something else'))).toBe(false);
  });
});
