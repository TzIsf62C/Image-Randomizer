import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, CloseIcon } from '../components/icons';
import { getRecordSetIds, isDuplicateTaxonomyName, normalizeTaxonomyName } from '../lib/metadata';
import {
  getImagesUsingTaxonomyId,
  removeTaxonomyItem,
  renameTaxonomyItem,
  restoreTaxonomyItem,
  visibleItems,
  type Taxonomy,
  type TaxonomyItem,
  type TaxonomyKind
} from '../lib/taxonomy';
import {
  buildTaxonomyEntry,
  exportUserDataArchive,
  getRecordImageSource,
  importUserDataArchive,
  isQuotaExceededError,
  loadNativeImageOverrides,
  loadUserImageBlob,
  listTaxonomyEntries,
  processUserImageFile,
  saveTaxonomyEntry,
  saveUserImage,
  saveUserImageBlob,
  useUserImageSources
} from '../lib/userStorage';
import { generateUuid } from '../lib/uuid';
import type { ImageRecord, SettingsState, SlotConfig, SlotTemplate } from '../types';

export type SettingsView = 'add-images' | 'configure' | 'library' | 'export' | 'settings';

const VIEW_TITLES: Record<SettingsView, string> = {
  'add-images': 'Add Images',
  configure: 'Configure Practice',
  library: 'Categories & Sets',
  export: 'Export Data',
  settings: 'Settings'
};

interface SettingsPageProps {
  view: SettingsView;
  taxonomy: Taxonomy;
  metadata: ImageRecord[];
  settings: SettingsState;
  onChange: (next: SettingsState) => void;
  onRefreshMetadata?: () => void;
}

const FEEDBACK_EMAIL = 'ad.infinitum@tutanota.com';

export const SettingsPage = ({ view, taxonomy, metadata, settings, onChange, onRefreshMetadata }: SettingsPageProps) => {
  const navigate = useNavigate();
  const [templateName, setTemplateName] = useState('');
  const [showImageRights, setShowImageRights] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSetName, setNewSetName] = useState('');
  const [taxonomyError, setTaxonomyError] = useState('');
  const [importFeedback, setImportFeedback] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [importReviewRows, setImportReviewRows] = useState<Array<ImageRecord & { blob?: Blob }>>([]);
  const [feedbackCopied, setFeedbackCopied] = useState(false);
  const userImageUrls = useUserImageSources([...metadata, ...importReviewRows]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const archiveInputRef = useRef<HTMLInputElement | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);

  const getFeedbackMailtoHref = (): string => `mailto:${FEEDBACK_EMAIL}`;

  const sendFeedbackEmail = (): void => {
    setFeedbackCopied(false);
  };

  const copyFeedbackEmail = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(FEEDBACK_EMAIL);
      setFeedbackCopied(true);
      window.setTimeout(() => setFeedbackCopied(false), 2500);
    } catch {
      setFeedbackCopied(false);
    }
  };

  useEffect(() => {
    return () => {
      importAbortRef.current?.abort();
    };
  }, []);

  const setItems = useMemo(() => visibleItems(taxonomy.sets), [taxonomy.sets]);
  const categoryItems = useMemo(() => visibleItems(taxonomy.categories), [taxonomy.categories]);

  const selectedSetKeys = useMemo(() => new Set(settings.selectedSetIds), [settings.selectedSetIds]);

  const eligibleByCategory = useMemo(() => {
    const filtered = metadata.filter((record) => getRecordSetIds(record).some((setId) => selectedSetKeys.has(setId)));
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
    const defaultCategory = categoryItems[0]?.id ?? 'subject';
    onChange({
      ...settings,
      slots: [...settings.slots, { id: generateUuid(), label: '', category: [defaultCategory] }]
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

  const toggleSetId = (setId: string): void => {
    const selected = new Set(settings.selectedSetIds);
    if (selected.has(setId)) {
      selected.delete(setId);
    } else {
      selected.add(setId);
    }
    onChange({ ...settings, selectedSetIds: [...selected] });
  };

  const addTaxonomyItem = async (kind: TaxonomyKind, rawName: string, reset: () => void): Promise<void> => {
    const noun = kind === 'sets' ? 'set' : 'category';
    const candidate = normalizeTaxonomyName(rawName);
    if (!candidate) {
      setTaxonomyError(`${kind === 'sets' ? 'Set' : 'Category'} name cannot be empty.`);
      return;
    }

    const items = kind === 'sets' ? taxonomy.sets : taxonomy.categories;
    if (isDuplicateTaxonomyName(visibleItems(items).map((item) => item.name), candidate)) {
      setTaxonomyError(`A ${noun} with that name already exists.`);
      return;
    }

    await saveTaxonomyEntry(buildTaxonomyEntry(candidate, 'user', kind === 'sets' ? 'set' : 'category'), kind);
    reset();
    setTaxonomyError('');
    onRefreshMetadata?.();
  };

  const renameItem = async (kind: TaxonomyKind, item: TaxonomyItem): Promise<void> => {
    const noun = kind === 'sets' ? 'set' : 'category';
    const nextName = window.prompt(`Rename ${noun}`, item.name);
    if (!nextName) return;

    const normalized = normalizeTaxonomyName(nextName);
    if (!normalized) {
      setTaxonomyError(`${kind === 'sets' ? 'Set' : 'Category'} name cannot be empty.`);
      return;
    }

    const items = kind === 'sets' ? taxonomy.sets : taxonomy.categories;
    const otherNames = visibleItems(items).filter((candidate) => candidate.id !== item.id).map((candidate) => candidate.name);
    if (isDuplicateTaxonomyName(otherNames, normalized)) {
      setTaxonomyError(`A ${noun} with that name already exists.`);
      return;
    }

    await renameTaxonomyItem(kind, item, normalized);
    setTaxonomyError('');
    onRefreshMetadata?.();
  };

  const deleteItem = async (kind: TaxonomyKind, item: TaxonomyItem): Promise<void> => {
    const noun = kind === 'sets' ? 'set' : 'category';
    const imageCount = getImagesUsingTaxonomyId(metadata, kind, item.id).length;
    const slotCount = kind === 'categories' ? settings.slots.filter((slot) => slot.category.includes(item.id)).length : 0;

    const warnings: string[] = [];
    if (!item.builtin && imageCount > 0) {
      warnings.push(`It will be removed from ${imageCount} image${imageCount === 1 ? '' : 's'}.`);
    }
    if (slotCount > 0) {
      warnings.push(
        `${slotCount} practice slot${slotCount === 1 ? ' uses' : 's use'} this category and will have no images until you pick another.`
      );
    }
    if (item.builtin) {
      warnings.push('You can restore it later from Restore defaults.');
    }

    if (!window.confirm(`${item.builtin ? 'Hide' : 'Delete'} ${noun} "${item.name}"?\n\n${warnings.join('\n')}`.trim())) {
      return;
    }

    if (kind === 'sets' && !item.builtin && settings.selectedSetIds.includes(item.id)) {
      onChange({ ...settings, selectedSetIds: settings.selectedSetIds.filter((setId) => setId !== item.id) });
    }

    await removeTaxonomyItem(kind, item, metadata);
    onRefreshMetadata?.();
  };

  const restoreItems = async (kind: TaxonomyKind, items: TaxonomyItem[]): Promise<void> => {
    for (const item of items) {
      await restoreTaxonomyItem(kind, item);
    }
    setTaxonomyError('');
    onRefreshMetadata?.();
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
      const { blob, ...rowRecord } = row;
      const nextRecord: ImageRecord = {
        ...rowRecord,
        origin: 'user',
        categoryIds: (rowRecord.categoryIds ?? rowRecord.categories ?? []).filter(Boolean),
        categories: (rowRecord.categoryIds ?? rowRecord.categories ?? []).filter(Boolean),
        setIds: (rowRecord.setIds ?? []).filter(Boolean),
        setName: undefined,
        rights: {
          creator: rowRecord.rights.creator ?? '',
          copyrightNotice: rowRecord.rights.copyrightNotice ?? '',
          license: rowRecord.rights.license ?? '',
          source: rowRecord.rights.source ?? 'user'
        },
        excluded: Boolean(rowRecord.excluded),
        updatedAt: new Date().toISOString()
      };

      await saveUserImage(nextRecord);
      if (blob) {
        await saveUserImageBlob(nextRecord.id, blob);
      }
    }

    setImportReviewRows([]);
    setImportFeedback(`Saved ${importReviewRows.length} review image${importReviewRows.length === 1 ? '' : 's'}.`);
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
            importedCount = 0;
            break;
          }

          setImportFeedback(`Failed to import ${file.name}. Please try again.`);
          setImportProgress('');
        }
      }

      if (controller.signal.aborted) {
        return;
      }

      if (importedCount > 0) {
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

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          resolve(result.split(',', 2)[1] ?? '');
        };
        reader.onerror = () => reject(reader.error ?? new Error('Failed to encode image.'));
        reader.readAsDataURL(blob);
      });

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
      files: archiveFiles,
      taxonomy: {
        categories: await listTaxonomyEntries('categories'),
        sets: await listTaxonomyEntries('sets')
      }
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

  const handleTemplateExport = (): void => {
    const blob = new Blob([JSON.stringify({ templates: settings.templates }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `image-randomizer-templates-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setImportFeedback('Templates exported.');
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

  const hasNoSets = settings.selectedSetIds.filter((setId) => setItems.some((item) => item.id === setId)).length === 0;
  const renderTaxonomyList = (kind: TaxonomyKind, items: TaxonomyItem[]) => {
    const hiddenBuiltIns = items.filter((item) => item.builtin && item.hidden);
    const renamedBuiltIns = items.filter((item) => item.builtin && item.name !== item.defaultName);

    return (
      <>
        <div className="template-list">
          {visibleItems(items).map((item) => (
            <article key={item.id} className="template-item">
              <strong>{item.name}</strong>
              <div>
                <button type="button" onClick={() => void renameItem(kind, item)}>
                  Rename
                </button>
                <button type="button" onClick={() => void deleteItem(kind, item)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>

        {hiddenBuiltIns.length > 0 || renamedBuiltIns.length > 0 ? (
          <div className="template-list">
            <h3>Restore defaults</h3>
            {hiddenBuiltIns.map((item) => (
              <article key={item.id} className="template-item">
                <span>{item.defaultName} (deleted)</span>
                <button type="button" onClick={() => void restoreItems(kind, [item])}>
                  Restore
                </button>
              </article>
            ))}
            <button
              type="button"
              className="action-button"
              onClick={() => void restoreItems(kind, [...new Set([...hiddenBuiltIns, ...renamedBuiltIns])])}
            >
              Restore all defaults
            </button>
          </div>
        ) : null}
      </>
    );
  };

  const missingCategorySlots = settings.slots.filter(
    (slot) => slot.category.length === 0 || slot.category.some((id) => !categoryItems.some((category) => category.id === id))
  ).length;
  const hasZeroCategory = settings.slots.some(
    (slot) => slot.category.length === 0 || slot.category.every((category) => (eligibleByCategory.get(category) ?? 0) === 0)
  );

  if (view === 'settings' && showImageRights) {
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
        <button type="button" className="icon-button" onClick={() => navigate('/')} aria-label="Back to practice">
          <ArrowLeftIcon />
        </button>
        <h1>{VIEW_TITLES[view]}</h1>
      </header>

      {view === 'export' ? (
        <section className="settings-section">
          <h2>Export</h2>
          <div className="template-save-row">
            <button type="button" onClick={() => void handleArchiveExport()}>
              Export image archive
            </button>
            <button type="button" onClick={handleTemplateExport} disabled={settings.templates.length === 0}>
              Export templates
            </button>
          </div>
          <p className="muted-text">
            The archive includes your imported images, edits to built-in images, and category and set details.
          </p>
          {importFeedback ? <p className="muted-text" aria-live="polite">{importFeedback}</p> : null}
        </section>
      ) : null}

      {view === 'add-images' ? (
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
                  <img src={getRecordImageSource(row, userImageUrls)} alt={row.fileName ?? row.file} loading="lazy" className="image-review-thumb" />
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
                        {categoryItems.map((category) => (
                          <option key={`${row.id}-${category.id}`} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Sets
                      <select
                        multiple
                        value={row.setIds ?? []}
                        onChange={(event) => {
                          const nextSets = Array.from(event.target.selectedOptions, (option) => option.value);
                          setImportReviewRows((previous) =>
                            previous.map((item) => {
                              if (item.id !== row.id) return item;
                              return {
                                ...item,
                                setIds: nextSets,
                                setName: undefined
                              };
                            })
                          );
                        }}
                      >
                        {setItems.map((setItem) => (
                          <option key={`${row.id}-set-${setItem.id}`} value={setItem.id}>
                            {setItem.name}
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
      ) : null}

      {view === 'library' ? (
      <>
      <section className="settings-section">
        <h2>Sets</h2>
        <div className="template-save-row">
          <input
            type="text"
            value={newSetName}
            onChange={(event) => setNewSetName(event.target.value)}
            placeholder="Add new set"
            aria-label="Add new set"
          />
          <button type="button" onClick={() => void addTaxonomyItem('sets', newSetName, () => setNewSetName(''))}>
            Add set
          </button>
        </div>

        {renderTaxonomyList('sets', taxonomy.sets)}
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
          <button type="button" onClick={() => void addTaxonomyItem('categories', newCategoryName, () => setNewCategoryName(''))}>
            Add category
          </button>
        </div>

        {renderTaxonomyList('categories', taxonomy.categories)}
      </section>

      {taxonomyError ? (
        <section className="settings-section error-box" aria-live="assertive">
          <p>{taxonomyError}</p>
        </section>
      ) : null}
      </>
      ) : null}

      {view === 'configure' ? (
      <>
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
              multiple
              value={slot.category}
              onChange={(event) =>
                updateSlot(index, {
                  category: Array.from(event.target.selectedOptions, (option) => option.value)
                })
              }
              aria-label={`Slot ${index + 1} categories`}
            >
              {taxonomy.categories
                .filter((category) => !category.hidden || slot.category.includes(category.id))
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.hidden ? ' (hidden)' : ''} ({eligibleByCategory.get(category.id) ?? 0})
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

      </>
      ) : null}

      {view === 'settings' ? (
      <>
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

      </>
      ) : null}

      {view === 'configure' ? (
      <>
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

      {view === 'configure' ? (
      <section className="settings-section">
        <h2>Sets</h2>
        <div className="set-grid">
          {setItems.map((setItem) => (
            <label key={setItem.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={selectedSetKeys.has(setItem.id)}
                onChange={() => toggleSetId(setItem.id)}
              />
              {setItem.name}
            </label>
          ))}
        </div>
      </section>
      ) : null}

      {view === 'configure' ? (
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
      ) : null}

      {(hasNoSets || hasZeroCategory || missingCategorySlots > 0) && (
        <section className="settings-section error-box" aria-live="assertive">
          {hasNoSets ? <p>No sets selected. Select at least one set.</p> : null}
          {missingCategorySlots > 0 ? (
            <p>
              {missingCategorySlots} slot{missingCategorySlots === 1 ? ' uses' : 's use'} a category that was deleted or
              hidden. Choose a different category.
            </p>
          ) : null}
          {hasZeroCategory ? <p>At least one slot category has zero eligible images.</p> : null}
        </section>
      )}
      </>
      ) : null}

      {view === 'settings' ? (
      <>
      <section className="settings-section feedback-section">
        <h2>Feedback &amp; Support</h2>
        <p className="muted-text feedback-intro">
          Hit a problem, have a feature idea, or just want to say hello? Email me.
        </p>
        <div className="feedback-card">
          <div className="feedback-email-row">
            <a className="feedback-email-link" href={getFeedbackMailtoHref()}>
              {FEEDBACK_EMAIL}
            </a>
            <div className="feedback-actions">
              <a
                className="action-button feedback-send-link"
                href={getFeedbackMailtoHref()}
                onClick={sendFeedbackEmail}
              >
                Send Email
              </a>
              <button type="button" className="action-button" onClick={() => void copyFeedbackEmail()}>
                Copy Address
              </button>
            </div>
          </div>
          {feedbackCopied ? <p className="feedback-toast" role="status">Address Copied</p> : null}
        </div>
      </section>

      <footer className="settings-rights-footer">
        <p>Image Randomizer App Copyright © 2026 TzIsf62C</p>
        <button type="button" className="action-button" onClick={() => setShowImageRights(true)}>
          Image Rights
        </button>
      </footer>
      </>
      ) : null}
    </main>
  );
};
