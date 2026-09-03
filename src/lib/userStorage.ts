import { useEffect, useState } from 'react';
import type { ImageRecord } from '../types';
import { resolveAssetUrl, type NativeImageOverride } from './metadata';
import { generateUuid } from './uuid';

export interface UserArchiveFile {
  id: string;
  fileName: string;
  mimeType: string;
  data: string;
}

export interface UserDataArchive {
  version: number;
  exportedAt: string;
  userImages: ImageRecord[];
  nativeOverrides: NativeImageOverride[];
  files: UserArchiveFile[];
}

export interface UserDataArchiveInput {
  userImages?: ImageRecord[];
  nativeOverrides?: NativeImageOverride[];
  files?: UserArchiveFile[];
}

export interface TaxonomyEntry {
  id: string;
  name: string;
  origin: 'native' | 'user';
  createdAt: string;
  updatedAt: string;
}

export const buildTaxonomyEntry = (
  name: string,
  origin: 'native' | 'user' = 'user',
  kind: 'category' | 'set' = 'category'
): TaxonomyEntry => {
  const trimmed = name.trim();
  const normalized = trimmed.replace(/\s+/g, ' ');
  const slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'taxonomy';
  const now = new Date().toISOString();

  return {
    id: `${kind}-${slug}-${generateUuid().slice(0, 8)}`,
    name: normalized,
    origin,
    createdAt: now,
    updatedAt: now
  };
};

export const saveTaxonomyEntry = async (entry: TaxonomyEntry, storeName: 'categories' | 'sets' = 'categories'): Promise<void> => {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed to save taxonomy entry in ${storeName}.`));
  });
};

export const listTaxonomyEntries = async (storeName: 'categories' | 'sets'): Promise<TaxonomyEntry[]> => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve((request.result ?? []) as TaxonomyEntry[]);
    request.onerror = () => reject(request.error ?? new Error(`Failed to load taxonomy entries from ${storeName}.`));
  });
};

export const deleteTaxonomyEntry = async (storeName: 'categories' | 'sets', id: string): Promise<void> => {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed to delete taxonomy entry from ${storeName}.`));
  });
};

export const buildUserImageRecord = (file: File): ImageRecord => {
  const now = new Date().toISOString();
  const id = `user-${generateUuid()}`;
  const extension = (file.name.split('.').pop() ?? 'bin').trim();

  return {
    id,
    file: `${id}.${extension || 'bin'}`,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    origin: 'user',
    categoryIds: [],
    setIds: [],
    excluded: false,
    rights: {
      creator: '',
      copyrightNotice: '',
      license: '',
      source: 'user'
    },
    createdAt: now,
    updatedAt: now,
    bytes: file.size,
    width: undefined,
    height: undefined
  };
};

export const areUserImageUrlMapsEqual = (previous: Record<string, string>, next: Record<string, string>): boolean => {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  return previousKeys.every((key) => next[key] === previous[key]);
};

export const getRecordImageSource = (
  record: Pick<ImageRecord, 'id' | 'origin' | 'file'>,
  userImageUrls: Record<string, string> = {}
): string => {
  if (record.origin === 'user') {
    const url = userImageUrls[record.id];
    return typeof url === 'string' && url.trim() ? url : '';
  }

  return resolveAssetUrl(`images/${record.file}`);
};

type UserImageSourceRecord = ImageRecord & { blob?: Blob };

export const useUserImageSources = (records: UserImageSourceRecord[]): Record<string, string> => {
  const [userImageUrls, setUserImageUrls] = useState<Record<string, string>>({});
  const userRecordSignature = records.filter((record) => record.origin === 'user').map((record) => record.id).join('|');

  useEffect(() => {
    const userRecords = records.filter((record) => record.origin === 'user');
    if (userRecords.length === 0) {
      setUserImageUrls((previous) => {
        if (Object.keys(previous).length === 0) {
          return previous;
        }

        Object.values(previous).forEach((url) => URL.revokeObjectURL(url));
        return {};
      });
      return;
    }

    let isActive = true;
    const nextUrls: Record<string, string> = {};

    const loadImages = async (): Promise<void> => {
      for (const record of userRecords) {
        const blob = record.blob instanceof Blob ? record.blob : await loadUserImageBlob(record.id);
        if (!blob) continue;
        nextUrls[record.id] = URL.createObjectURL(blob);
      }

      if (!isActive) {
        Object.values(nextUrls).forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setUserImageUrls((previous) => {
        if (areUserImageUrlMapsEqual(previous, nextUrls)) {
          return previous;
        }

        Object.values(previous).forEach((url) => URL.revokeObjectURL(url));
        return nextUrls;
      });
    };

    void loadImages();

    return () => {
      isActive = false;
      setUserImageUrls((previous) => {
        if (Object.keys(previous).length === 0) {
          return previous;
        }

        Object.values(previous).forEach((url) => URL.revokeObjectURL(url));
        return {};
      });
    };
  }, [userRecordSignature]);

  return userImageUrls;
};

const resizeRasterForPortableMaster = async (file: File): Promise<Blob> => {
  if (typeof document === 'undefined') {
    return file;
  }

  try {
    const image = await createImageBitmap(file);
    const maxDimension = 1200;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      image.close();
      return file;
    }

    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (nextBlob) => {
          if (!nextBlob) {
            reject(new Error('Failed to process raster image.'));
            return;
          }
          resolve(nextBlob);
        },
        'image/webp',
        0.88
      );
    });

    image.close();
    return blob;
  } catch {
    return file;
  }
};

export const processUserImageFile = async (file: File): Promise<ImageRecord & { blob?: Blob }> => {
  const record = buildUserImageRecord(file);
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');

  let processedBlob: Blob = file;
  let outputMimeType = file.type || 'application/octet-stream';
  let outputExtension = extension || 'bin';

  if (!isSvg && file.type.startsWith('image/')) {
    processedBlob = await resizeRasterForPortableMaster(file);
    outputMimeType = processedBlob.type || 'image/webp';
    outputExtension = outputMimeType.includes('webp') ? 'webp' : outputMimeType.includes('png') ? 'png' : 'bin';
  }

  const finalRecord: ImageRecord & { blob?: Blob } = {
    ...record,
    file: `${record.id}.${outputExtension}`,
    mimeType: outputMimeType,
    bytes: processedBlob.size,
    blob: processedBlob
  };

  try {
    const bitmap = await createImageBitmap(processedBlob);
    finalRecord.width = bitmap.width;
    finalRecord.height = bitmap.height;
    bitmap.close();
  } catch {
    // Ignore invalid image data and keep the metadata record usable.
  }

  return finalRecord;
};

export const exportUserDataArchive = ({
  userImages = [],
  nativeOverrides = [],
  files = []
}: UserDataArchiveInput = {}): UserDataArchive => ({
  version: 1,
  exportedAt: new Date().toISOString(),
  userImages,
  nativeOverrides,
  files
});

export const importUserDataArchive = async (archive: Partial<UserDataArchive>): Promise<void> => {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return;
  }

  const userImages = Array.isArray(archive.userImages) ? archive.userImages : [];
  const nativeOverrides = Array.isArray(archive.nativeOverrides) ? archive.nativeOverrides : [];
  const files = Array.isArray(archive.files) ? archive.files : [];

  for (const userImage of userImages) {
    await saveUserImage(userImage);
  }

  for (const override of nativeOverrides) {
    await saveNativeImageOverride(override);
  }

  for (const file of files) {
    const blob = file.data ? new Blob([Uint8Array.from(atob(file.data), (char) => char.charCodeAt(0))], { type: file.mimeType }) : null;
    if (blob) {
      await saveUserImageBlob(file.id, blob);
    }
  }
};

const DB_NAME = 'image-randomizer-db';
const DB_VERSION = 1;

const STORE_NAMES = {
  nativeOverrides: 'nativeOverrides',
  images: 'images',
  categories: 'categories',
  sets: 'sets',
  blobs: 'blobs',
  history: 'history'
} as const;

const openDatabase = async (): Promise<IDBDatabase> => {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    throw new Error('IndexedDB is not supported in this browser.');
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      Object.values(STORE_NAMES).forEach((storeName) => {
        if (!database.objectStoreNames.contains(storeName)) {
          const store = database.createObjectStore(storeName, { keyPath: 'id' });

          if (storeName === STORE_NAMES.nativeOverrides) {
            store.createIndex('imageId', 'imageId', { unique: true });
          }

          if (storeName === STORE_NAMES.images) {
            store.createIndex('origin', 'origin', { unique: false });
            store.createIndex('excluded', 'excluded', { unique: false });
          }

          if (storeName === STORE_NAMES.history) {
            store.createIndex('createdAt', 'createdAt', { unique: false });
            store.createIndex('imageId', 'imageId', { unique: false });
          }
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'));
  });
};

export const loadNativeImageOverrides = async (): Promise<NativeImageOverride[]> => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAMES.nativeOverrides, 'readonly');
    const store = transaction.objectStore(STORE_NAMES.nativeOverrides);
    const request = store.getAll();

    request.onsuccess = () => resolve((request.result ?? []) as NativeImageOverride[]);
    request.onerror = () => reject(request.error ?? new Error('Failed to load native overrides.'));
  });
};

export const saveNativeImageOverride = async (override: NativeImageOverride): Promise<void> => {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAMES.nativeOverrides, 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.nativeOverrides);
    const request = store.put({ ...override, id: override.imageId });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to save native override.'));
  });
};

export const clearNativeImageOverride = async (imageId: string): Promise<void> => {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAMES.nativeOverrides, 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.nativeOverrides);
    const request = store.delete(imageId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to clear native override.'));
  });
};

export const saveUserImage = async (record: ImageRecord): Promise<void> => {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAMES.images, 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.images);
    const request = store.put({ ...record, origin: 'user' });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to save user image.'));
  });
};

export const SESSION_HISTORY_LIMIT = 50;

export const capSessionHistory = <T extends { spinNumber: number }>(entries: T[], maxEntries = SESSION_HISTORY_LIMIT): T[] => {
  const safeLimit = Number.isFinite(maxEntries) ? Math.max(0, Math.floor(maxEntries)) : 0;

  if (entries.length === 0 || safeLimit === 0) {
    return [];
  }

  if (entries.length <= safeLimit) {
    return [...entries];
  }

  return entries.slice(entries.length - safeLimit);
};

export const isQuotaExceededError = (error: unknown): boolean => {
  if (!error) {
    return false;
  }

  if (error instanceof DOMException) {
    return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22 || error.code === 1014;
  }

  if (typeof error === 'object') {
    const { name, code } = error as { name?: string; code?: number };
    if (typeof name === 'string' && /(QuotaExceededError|NS_ERROR_DOM_QUOTA_REACHED)/i.test(name)) {
      return true;
    }

    if (typeof code === 'number' && (code === 22 || code === 1014)) {
      return true;
    }
  }

  if (typeof error === 'string') {
    return /quota|exceeded|ns_error_dom_quota_reached/i.test(error);
  }

  return false;
};

export const setImageExcluded = async (imageId: string, excluded: boolean): Promise<ImageRecord | null> => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAMES.images, 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.images);
    const request = store.get(imageId);

    request.onsuccess = () => {
      const record = request.result as ImageRecord | undefined;
      if (!record) {
        resolve(null);
        return;
      }

      const nextRecord = { ...record, excluded, updatedAt: new Date().toISOString() };
      const putRequest = store.put(nextRecord);

      putRequest.onsuccess = () => resolve(nextRecord);
      putRequest.onerror = () => reject(putRequest.error ?? new Error('Failed to update image exclusion state.'));
    };

    request.onerror = () => reject(request.error ?? new Error('Failed to load image for exclusion update.'));
  });
};

export const saveUserImageBlob = async (imageId: string, blob: Blob): Promise<void> => {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAMES.blobs, 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.blobs);
    const request = store.put({ id: imageId, blob });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to save user image blob.'));
  });
};

export const loadUserImageBlob = async (imageId: string): Promise<Blob | null> => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAMES.blobs, 'readonly');
    const store = transaction.objectStore(STORE_NAMES.blobs);
    const request = store.get(imageId);

    request.onsuccess = () => {
      const value = request.result as { blob?: Blob } | undefined;
      resolve(value?.blob ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to load user image blob.'));
  });
};

export const listUserImages = async (): Promise<ImageRecord[]> => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAMES.images, 'readonly');
    const store = transaction.objectStore(STORE_NAMES.images);
    const request = store.getAll();

    request.onsuccess = () => resolve((request.result ?? []) as ImageRecord[]);
    request.onerror = () => reject(request.error ?? new Error('Failed to load user images.'));
  });
};

export const deleteUserImage = async (imageId: string): Promise<void> => {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([STORE_NAMES.images, STORE_NAMES.blobs], 'readwrite');
    const imagesStore = transaction.objectStore(STORE_NAMES.images);
    const blobsStore = transaction.objectStore(STORE_NAMES.blobs);

    imagesStore.delete(imageId);
    if (typeof imageId === 'string') {
      blobsStore.delete(imageId);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to delete user image.'));
  });
};
