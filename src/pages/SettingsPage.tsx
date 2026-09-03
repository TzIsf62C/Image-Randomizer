import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloseIcon } from '../components/icons';
import {
  createTaxonomyNameKey,
  extractSetOptions,
  getRecordSetLabel,
  isDuplicateTaxonomyName,
  normalizeSetKey,
  normalizeTaxonomyName
} from '../lib/metadata';
import {
  buildTaxonomyEntry,
  deleteTaxonomyEntry,
  exportUserDataArchive,
  getRecordImageSource,
  importUserDataArchive,
  isQuotaExceededError,
  listTaxonomyEntries,
  loadNativeImageOverrides,
  loadUserImageBlob,
  processUserImageFile,
  saveTaxonomyEntry,
  saveUserImage,
  saveUserImageBlob,
  useUserImageSources
} from '../lib/userStorage';
import { generateUuid } from '../lib/uuid';
import type { ImageRecord, SettingsState, SlotConfig, SlotTemplate } from '../types';

interface SettingsPageProps {
  metadata: ImageRecord[];
  settings: SettingsState;
  onChange: (next: SettingsState) => void;
  onRefreshMetadata?: () => void;
}

export const SettingsPage = ({ metadata, settings, onChange, onRefreshMetadata }: SettingsPageProps) => {
  const navigate = useNavigate();
  const [templateName, setTemplateName] = useState('');
  const [showImageRights, setShowImageRights] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [customSets, setCustomSets] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSetName, setNewSetName] = useState('');
  const [taxonomyError, setTaxonomyError] = useState('');
  const [importFeedback, setImportFeedback] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [importReviewRows, setImportReviewRows] = useState<Array<ImageRecord & { blob?: Blob }>>([]);
  const userImageUrls = useUserImageSources(metadata);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const archiveInputRef = useRef<HTMLInputElement | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      importAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const loadStoredTaxonomy = async (): Promise<void> => {
      const storedCategories = await listTaxonomyEntries('categories');
      const storedSets = await listTaxonomyEntries('sets');

      setCustomCategories(storedCategories.map((entry) => entry.name));
      setCustomSets(storedSets.map((entry) => entry.name));
    };

    void loadStoredTaxonomy();
  }, []);

  const baseSetOptions = useMemo(() => extractSetOptions(metadata), [metadata]);
  const setOptions = useMemo(
    () => [
      ...baseSetOptions,
      ...customSets.map((setName) => ({ key: createTaxonomyNameKey(setName), label: setName }))
    ].filter((option, index, list) => index === list.findIndex((candidate) => candidate.key === option.key)),
    [baseSetOptions, customSets]
  );

  const selectedSetKeys = useMemo(
    () => new Set(settings.selectedSetNames.map((setName) => normalizeSetKey(setName))),
    [settings.selectedSetNames]
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    metadata.forEach((record) => {
      const categoryIds = record.categoryIds ?? record.categories ?? [];
      categoryIds.forEach((category) => set.add(category));
    });
    customCategories.forEach((category) => set.add(category));
    return [...set].sort();
  }, [customCategories, metadata]);

  const eligibleByCategory = useMemo(() => {
    const filtered = metadata.filter((record) => selectedSetKeys.has(normalizeSetKey(getRecordSetLabel(record))));
    const map = new Map<string, number>();

    filtered.forEach((record) => {
      const categoryIds = record.categoryIds ?? record.categories ?? [];
      categoryIds.forEach((category) => {
        map.set(category, (map.get(category) ?? 0) + 1);
      });
    });

    return map;
  }, [metadata, selectedSetKeys]);

  const updateSlot = (index: number, next: Partial<SlotConfig>): void => {
    const nextSlots = settings.slots.map((slot, slotIndex) =>
      slotIndex === index ? { ...slot, ...next } : slot
    );
    onChange({ ...settings, slots: nextSlots });
  };

  const addSlot = (): void => {
    const defaultCategory = categories[0] ?? 'subject';
    onChange({
      ...settings,
      slots: [...settings.slots, { id: generateUuid(), label: '', category: defaultCategory }]
    });
  };

  const removeSlot = (index: number): void => {
    if (settings.slots.length <= 1) return;
    onChange({
      ...settings,
      slots: settings.slots.filter((_, slotIndex) => slotIndex !== index)
    });
  };

  const moveSlot = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= settings.slots.length) return;

    const nextSlots = settings.slots.slice();
    const [moved] = nextSlots.splice(index, 1);
    nextSlots.splice(target, 0, moved);
    onChange({ ...settings, slots: nextSlots });
  };

  const toggleSetName = (setName: string): void => {
    const selected = new Set(settings.selectedSetNames);
    if (selected.has(setName)) {
      selected.delete(setName);
    } else {
      selected.add(setName);
    }
    onChange({ ...settings, selectedSetNames: [...selected] });
  };

  const addCategory = async (): Promise<void> => {
    const candidate = normalizeTaxonomyName(newCategoryName);
    if (!candidate) {
      setTaxonomyError('Category name cannot be empty.');
      return;
    }

    const existingNames = [...categories, ...customCategories];
    if (isDuplicateTaxonomyName(existingNames, candidate)) {
      setTaxonomyError('A category with that name already exists.');
      return;
    }

    const entry = buildTaxonomyEntry(candidate, 'user', 'category');
    await saveTaxonomyEntry(entry, 'categories');
    setCustomCategories((previous) => [...previous, candidate]);
    setNewCategoryName('');
    setTaxonomyError('');
  };

  const addSet = async (): Promise<void> => {
    const candidate = normalizeTaxonomyName(newSetName);
    if (!candidate) {
      setTaxonomyError('Set name cannot be empty.');
      return;
    }

    const existingNames = [...setOptions.map((option) => option.label), ...customSets];
    if (isDuplicateTaxonomyName(existingNames, candidate)) {
      setTaxonomyError('A set with that name already exists.');
      return;
    }

    const entry = buildTaxonomyEntry(candidate, 'user', 'set');
    await saveTaxonomyEntry(entry, 'sets');
    setCustomSets((previous) => [...previous, candidate]);
    setNewSetName('');
    setTaxonomyError('');
  };

  const renameCustomCategory = async (currentName: string): Promise<void> => {
    const nextName = window.prompt('Rename category', currentName);
    if (!nextName) return;

    const normalized = normalizeTaxonomyName(nextName);
    if (!normalized) {
      setTaxonomyError('Category name cannot be empty.');
      return;
    }

    const existingNames = [...categories.filter((name) => name !== currentName), ...customCategories.filter((name) => name !== currentName)];
    if (isDuplicateTaxonomyName(existingNames, normalized)) {
      setTaxonomyError('A category with that name already exists.');
      return;
    }

    const taxonomyEntries = await listTaxonomyEntries('categories');
    const entry = taxonomyEntries.find((candidate) => candidate.name === currentName && candidate.origin === 'user');
    if (!entry) return;

    const updated = { ...entry, name: normalized, updatedAt: new Date().toISOString() };
    await saveTaxonomyEntry(updated, 'categories');
    setCustomCategories((previous) => previous.map((name) => (name === currentName ? normalized : name)));
    setTaxonomyError('');
  };

  const renameCustomSet = async (currentName: string): Promise<void> => {
    const nextName = window.prompt('Rename set', currentName);
    if (!nextName) return;

    const normalized = normalizeTaxonomyName(nextName);
    if (!normalized) {
      setTaxonomyError('Set name cannot be empty.');
      return;
    }

    const existingNames = [...setOptions.map((option) => option.label).filter((name) => name !== currentName), ...customSets.filter((name) => name !== currentName)];
    if (isDuplicateTaxonomyName(existingNames, normalized)) {
      setTaxonomyError('A set with that name already exists.');
      return;
    }

    const taxonomyEntries = await listTaxonomyEntries('sets');
    const entry = taxonomyEntries.find((candidate) => candidate.name === currentName && candidate.origin === 'user');
    if (!entry) return;

    const updated = { ...entry, name: normalized, updatedAt: new Date().toISOString() };
    await saveTaxonomyEntry(updated, 'sets');
    setCustomSets((previous) => previous.map((name) => (name === currentName ? normalized : name)));
    setTaxonomyError('');
  };

  const deleteCustomCategory = async (currentName: string): Promise<void> => {
    const taxonomyEntries = await listTaxonomyEntries('categories');
    const entry = taxonomyEntries.find((candidate) => candidate.name === currentName && candidate.origin === 'user');
    if (!entry) return;

    await deleteTaxonomyEntry('categories', entry.id);
    setCustomCategories((previous) => previous.filter((name) => name !== currentName));
  };

  const deleteCustomSet = async (currentName: string): Promise<void> => {
    const taxonomyEntries = await listTaxonomyEntries('sets');
    const entry = taxonomyEntries.find((candidate) => candidate.name === currentName && candidate.origin === 'user');
    if (!entry) return;

    await deleteTaxonomyEntry('sets', entry.id);
    setCustomSets((previous) => previous.filter((name) => name !== currentName));
  };

  const saveTemplate = (): void => {
    const name = templateName.trim();
    if (!name) return;

    const template: SlotTemplate = {
      id: generateUuid(),
      name,
      slots: settings.slots
    };

    onChange({ ...settings, templates: [...settings.templates, template] });
    setTemplateName('');
  };

  const persistImportReview = async (): Promise<void> => {
    if (importReviewRows.length === 0) {
      setImportFeedback('No imported images to save.');
      return;
    }

    for (const row of importReviewRows) {
      const nextRecord: ImageRecord = {
        ...row,
        origin: 'user',
        categoryIds: (row.categoryIds ?? row.categories ?? []).filter(Boolean),
        categories: (row.categoryIds ?? row.categories ?? []).filter(Boolean),
        setIds: (row.setIds ?? (row.setName ? [row.setName] : [])).filter(Boolean),
        setName: (row.setIds ?? (row.setName ? [row.setName] : []))[0] ?? undefined,
        rights: {
          creator: row.rights.creator ?? '',
          copyrightNotice: row.rights.copyrightNotice ?? '',
          license: row.rights.license ?? '',
          source: row.rights.source ?? 'user'
        },
        excluded: Boolean(row.excluded),
        updatedAt: new Date().toISOString()
      };

      await saveUserImage(nextRecord);
      if (row.blob) {
        await saveUserImageBlob(nextRecord.id, row.blob);
      }
    }

    setImportReviewRows([]);
    setImportFeedback(`Saved ${importReviewRows.length} review${importReviewRows.length === 1 ? '' : 'ed'} image${importReviewRows.length === 1 ? '' : 's'}.`);
    onRefreshMetadata?.();
  };

  const handleImageImport = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const validFiles = files.filter((file) => file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.svg'));
    if (validFiles.length === 0) {
      setImportFeedback('Only image files can be imported.');
      setImportProgress('');
      event.target.value = '';
      return;
    }

    const controller = new AbortController();
    importAbortRef.current = controller;
    setImportBusy(true);
    setImportFeedback('Importing images...');
    setImportProgress('');
    setTaxonomyError('');
    setImportReviewRows([]);

    try {
      let importedCount = 0;

      for (let index = 0; index < validFiles.length; index += 1) {
        if (controller.signal.aborted) {
          setImportFeedback('Import cancelled.');
          setImportProgress('');
          break;
        }

        const file = validFiles[index];
        setImportProgress(`Processing ${index + 1} of ${validFiles.length}: ${file.name}`);

        try {
          const processed = await processUserImageFile(file);
          setImportReviewRows((previous) => [...previous, processed]);
          importedCount += 1;
        } catch (error) {
          if (controller.signal.aborted) {
            setImportFeedback('Import cancelled.');
            break;
          }

          if (isQuotaExceededError(error)) {
            setImportFeedback('Storage is full. Delete unused imported images or free space, then try again.');
            setImportProgress('');
            break;
          }

          setImportFeedback(`Failed to import ${file.name}. Please try again.`);
          setImportProgress('');
        }
      }

      if (controller.signal.aborted) {
        return;
      }

      if (importedCount > 0 && !importFeedback.startsWith('Storage is full')) {
        setImportFeedback(`Imported ${importedCount} image${importedCount === 1 ? '' : 's'} and queued them for review.`);
        setImportProgress('');
      }
    } finally {
      importAbortRef.current = null;
      setImportBusy(false);
      event.target.value = '';
    }
  };

  const cancelImport = (): void => {
    importAbortRef.current?.abort();
    setImportBusy(false);
    setImportFeedback('Import cancelled.');
    setImportProgress('');
  };

  const handleArchiveExport = async (): Promise<void> => {
    const userArchiveImages = metadata.filter((record) => record.origin === 'user');
    const nativeOverrides = await loadNativeImageOverrides();
    const archiveFiles: Array<{ id: string; fileName: string; mimeType: string; data: string }> = [];

    for (const userImage of userArchiveImages) {
      const blob = await loadUserImageBlob(userImage.id);
      if (!blob) continue;

      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));

      archiveFiles.push({
        id: userImage.id,
        fileName: userImage.fileName ?? userImage.file,
        mimeType: userImage.mimeType ?? 'application/octet-stream',
        data: base64
      });
    }

    const archive = exportUserDataArchive({
      userImages: userArchiveImages,
      nativeOverrides,
      files: archiveFiles
    });

    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `image-randomizer-user-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setImportFeedback('User data archive exported.');
  };

  const handleArchiveImport = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Parameters<typeof importUserDataArchive>[0];
      await importUserDataArchive(parsed);
      setImportFeedback(`Imported archive from ${file.name}.`);
      onRefreshMetadata?.();
    } catch (error) {
      setImportFeedback(
        error instanceof Error ? `Archive import failed: ${error.message}` : 'Archive import failed. Please try another file.'
      );
    } finally {
      event.target.value = '';
    }
  };

  const loadTemplate = (template: SlotTemplate): void => {
    onChange({ ...settings, slots: template.slots.map((slot) => ({ ...slot, id: generateUuid() })) });
  };

  const renameTemplate = (templateId: string): void => {
    const nextName = window.prompt('Rename template');
    if (!nextName) return;
    onChange({
      ...settings,
      templates: settings.templates.map((template) =>
        template.id === templateId ? { ...template, name: nextName.trim() } : template
      )
    });
  };

  const deleteTemplate = (templateId: string): void => {
    onChange({
      ...settings,
      templates: settings.templates.filter((template) => template.id !== templateId)
    });
  };

  const hasNoSets = settings.selectedSetNames.length === 0;
  const hasZeroCategory = settings.slots.some((slot) => (eligibleByCategory.get(slot.category) ?? 0) === 0);

  if (showImageRights) {
    return (
      <main className="settings-screen image-rights-screen">
        <header className="image-rights-header">
          <button
            className="icon-button image-rights-close"
            type="button"
            onClick={() => setShowImageRights(false)}
            aria-label="Close image rights"
          >
            <CloseIcon />
          </button>
          <h1>Image Rights</h1>
        </header>

        <section className="settings-section image-rights-list" aria-label="Image rights list">
          {metadata.map((record) => (
            <article key={record.id} className="image-rights-item">
              <img src={getRecordImageSource(record, userImageUrls)} alt={record.id} loading="lazy" />
              <div className="image-rights-copy">
                <p>{record.rights.copyrightNotice}</p>
                <p>{record.rights.license}</p>
              </div>
            </article>
          ))}
        </section>
      </main>
    );
  }

  return (
    <main className="settings-screen">
      <header className="settings-header">
        <h1>Settings</h1>
        <div className="template-save-row">
          <button type="button" onClick={() => navigate('/images')} className="action-button">
            Manage images
          </button>
          <button type="button" onClick={() => navigate('/')} className="action-button">
            Practice
          </button>
        </div>
      </header>

      <section className="settings-section">
        <h2>User images</h2>
        <div className="template-save-row">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importBusy} aria-busy={importBusy}>
            {importBusy ? 'Importing...' : 'Import image(s)'}
          </button>
          {importBusy ? (
            <button type="button" onClick={cancelImport} aria-label="Cancel active image import">
              Cancel
            </button>
          ) : null}
          <button type="button" onClick={() => void handleArchiveExport()}>
            Export archive
          </button>
          <button type="button" onClick={() => archiveInputRef.current?.click()}>
            Import archive
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.svg"
            multiple
            hidden
            disabled={importBusy}
            onChange={(event) => {
              void handleImageImport(event);
            }}
          />
          <input
            ref={archiveInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              void handleArchiveImport(event);
            }}
          />
        </div>

        {importProgress ? (
          <p className="muted-text" aria-live="polite">{importProgress}</p>
        ) : null}

        {importFeedback ? (
          <p className={`muted-text ${importFeedback.toLowerCase().includes('failed') || importFeedback.toLowerCase().includes('storage is full') || importFeedback.toLowerCase().includes('cancelled') ? 'error-box' : ''}`} aria-live="polite">
            {importFeedback}
          </p>
        ) : null}

        {importReviewRows.length > 0 ? (
          <section className="settings-section image-review-panel">
            <div className="image-review-header">
              <h3>Review imported images</h3>
              <div className="template-save-row">
                <button type="button" className="action-button" onClick={() => void persistImportReview()}>
                  Save imported images
                </button>
                <button
                  type="button"
                  className="action-button"
                  onClick={() => {
                    setImportReviewRows([]);
                    setImportFeedback('');
                  }}
                >
                  Discard
                </button>
              </div>
            </div>

            <div className="image-review-list">
              {importReviewRows.map((row) => (
                <article key={row.id} className="image-review-item">
                  <img src={getRecordImageSource(row, userImageUrls, row.blob)} alt={row.fileName ?? row.file} loading="lazy" className="image-review-thumb" />
                  <div className="image-review-copy">
                    <strong>{row.fileName ?? row.file}</strong>
                    <label>
                      Creator
                      <input
                        type="text"
                        value={row.rights.creator ?? ''}
                        onChange={(event) =>
                          setImportReviewRows((previous) =>
                            previous.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    rights: { ...item.rights, creator: event.target.value }
                                  }
                                : item
                            )
                          )
                        }
                      />
                    </label>
                    <label>
                      Copyright notice
                      <input
                        type="text"
                        value={row.rights.copyrightNotice ?? ''}
                        onChange={(event) =>
                          setImportReviewRows((previous) =>
                            previous.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    rights: { ...item.rights, copyrightNotice: event.target.value }
                                  }
                                : item
                            )
                          )
                        }
                      />
                    </label>
                    <label>
                      License
                      <input
                        type="text"
                        value={row.rights.license ?? ''}
                        onChange={(event) =>
                          setImportReviewRows((previous) =>
                            previous.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    rights: { ...item.rights, license: event.target.value }
                                  }
                                : item
                            )
                          )
                        }
                      />
                    </label>
                    <label>
                      Category tags
                      <select
                        multiple
                        value={row.categoryIds ?? row.categories ?? []}
                        onChange={(event) => {
                          const nextCategories = Array.from(event.target.selectedOptions, (option) => option.value);
                          setImportReviewRows((previous) =>
                            previous.map((item) => {
                              if (item.id !== row.id) return item;
                              return { ...item, categoryIds: nextCategories, categories: nextCategories };
                            })
                          );
                        }}
                      >
                        {categories.map((category) => (
                          <option key={`${row.id}-${category}`} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Sets
                      <select
                        multiple
                        value={row.setIds ?? (row.setName ? [row.setName] : [])}
                        onChange={(event) => {
                          const nextSets = Array.from(event.target.selectedOptions, (option) => option.value);
                          setImportReviewRows((previous) =>
                            previous.map((item) => {
                              if (item.id !== row.id) return item;
                              return {
                                ...item,
                                setIds: nextSets,
                                setName: nextSets[0] ?? undefined
                              };
                            })
                          );
                        }}
                      >
                        {setOptions.map((setOption) => (
                          <option key={`${row.id}-set-${setOption.key}`} value={setOption.label}>
                            {setOption.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

      </section>

      <section className="settings-section">
        <h2>Sets</h2>
        <div className="set-grid">
          {setOptions.map((setOption) => (
            <label key={setOption.key} className="checkbox-label">
              <input
                type="checkbox"
                checked={selectedSetKeys.has(setOption.key)}
                onChange={() => toggleSetName(setOption.label)}
              />
              {setOption.label}
            </label>
          ))}
        </div>
        <div className="template-save-row">
          <input
            type="text"
            value={newSetName}
            onChange={(event) => setNewSetName(event.target.value)}
            placeholder="Add new set"
            aria-label="Add new set"
          />
          <button type="button" onClick={() => void addSet()}>
            Add set
          </button>
        </div>

        {customSets.length > 0 ? (
          <div className="template-list">
            {customSets.map((setName) => (
              <article key={setName} className="template-item">
                <strong>{setName}</strong>
                <div>
                  <button type="button" onClick={() => void renameCustomSet(setName)}>
                    Rename
                  </button>
                  <button type="button" onClick={() => void deleteCustomSet(setName)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="settings-section">
        <h2>Categories</h2>
        <div className="template-save-row">
          <input
            type="text"
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
            placeholder="Add new category"
            aria-label="Add new category"
          />
          <button type="button" onClick={() => void addCategory()}>
            Add category
          </button>
        </div>

        {customCategories.length > 0 ? (
          <div className="template-list">
            {customCategories.map((categoryName) => (
              <article key={categoryName} className="template-item">
                <strong>{categoryName}</strong>
                <div>
                  <button type="button" onClick={() => void renameCustomCategory(categoryName)}>
                    Rename
                  </button>
                  <button type="button" onClick={() => void deleteCustomCategory(categoryName)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {taxonomyError ? (
        <section className="settings-section error-box" aria-live="assertive">
          <p>{taxonomyError}</p>
        </section>
      ) : null}

      <section className="settings-section">
        <h2>Slots</h2>
        {settings.slots.map((slot, index) => (
          <article key={slot.id} className="slot-editor">
            <input
              type="text"
              value={slot.label}
              placeholder="Optional label"
              onChange={(event) => updateSlot(index, { label: event.target.value })}
              aria-label={`Slot ${index + 1} label`}
            />
            <select
              value={slot.category}
              onChange={(event) => updateSlot(index, { category: event.target.value })}
              aria-label={`Slot ${index + 1} category`}
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category} ({eligibleByCategory.get(category) ?? 0})
                </option>
              ))}
            </select>
            <div className="slot-controls">
              <button type="button" onClick={() => moveSlot(index, -1)} aria-label="Move slot left">
                Up
              </button>
              <button type="button" onClick={() => moveSlot(index, 1)} aria-label="Move slot right">
                Down
              </button>
              <button type="button" onClick={() => removeSlot(index)} aria-label="Delete slot">
                Delete
              </button>
            </div>
          </article>
        ))}
        <button type="button" onClick={addSlot} className="action-button">
          Add slot
        </button>
      </section>

      <section className="settings-section">
        <h2>Randomization</h2>
        <label>
          Repeat mode
          <select
            value={settings.repeatMode}
            onChange={(event) => onChange({ ...settings, repeatMode: event.target.value as SettingsState['repeatMode'] })}
          >
            <option value="random">Random</option>
            <option value="cycle">No repeats until all used</option>
            <option value="avoidLastN">Avoid images seen within last N spins</option>
          </select>
        </label>

        <label>
          N value
          <input
            type="number"
            min={1}
            value={settings.avoidLastN}
            onChange={(event) => onChange({ ...settings, avoidLastN: Math.max(1, Number(event.target.value) || 1) })}
          />
        </label>
      </section>

      <section className="settings-section">
        <h2>Behavior</h2>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.animationEnabled}
            onChange={(event) => onChange({ ...settings, animationEnabled: event.target.checked })}
          />
          Animation enabled
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(event) => onChange({ ...settings, soundEnabled: event.target.checked })}
          />
          Sound enabled
        </label>
      </section>

      <section className="settings-section">
        <h2>Templates</h2>
        <div className="template-save-row">
          <input
            type="text"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder="Template name"
          />
          <button type="button" onClick={saveTemplate}>
            Save
          </button>
        </div>

        <div className="template-list">
          {settings.templates.map((template) => (
            <article key={template.id} className="template-item">
              <strong>{template.name}</strong>
              <div>
                <button type="button" onClick={() => loadTemplate(template)}>
                  Load
                </button>
                <button type="button" onClick={() => renameTemplate(template.id)}>
                  Rename
                </button>
                <button type="button" onClick={() => deleteTemplate(template.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {(hasNoSets || hasZeroCategory) && (
        <section className="settings-section error-box" aria-live="assertive">
          {hasNoSets ? <p>No sets selected. Select at least one set.</p> : null}
          {hasZeroCategory ? <p>At least one slot category has zero eligible images.</p> : null}
        </section>
      )}

      <footer className="settings-rights-footer">
        <p>Image Randomizer App Copyright © 2026 TzIsf62C</p>
        <button type="button" className="action-button" onClick={() => setShowImageRights(true)}>
          Image Rights
        </button>
      </footer>
    </main>
  );
};
