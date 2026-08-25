import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, CloseIcon, FilterIcon } from '../components/icons';
import { getRecordSetLabel, normalizeSetKey } from '../lib/metadata';
import {
  deleteUserImage,
  getRecordImageSource,
  saveNativeImageOverride,
  saveUserImage,
  setImageExcluded,
  useUserImageSources
} from '../lib/userStorage';
import type { ImageRecord } from '../types';

interface ImageManagementPageProps {
  metadata: ImageRecord[];
  onRefreshMetadata?: () => void;
}

const EMPTY_FILTER = 'all';
const NO_SET_OPTION = '__no_set__';
const NO_CATEGORY_OPTION = '__no_category__';

type BulkModalType = 'set' | 'category' | null;

export const ImageManagementPage = ({ metadata, onRefreshMetadata }: ImageManagementPageProps) => {
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [originFilter, setOriginFilter] = useState<'all' | 'native' | 'user'>(EMPTY_FILTER as 'all' | 'native' | 'user');
  const [setFilter, setSetFilter] = useState<string>(EMPTY_FILTER);
  const [categoryFilter, setCategoryFilter] = useState<string>(EMPTY_FILTER);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [bulkModal, setBulkModal] = useState<BulkModalType>(null);
  const [bulkSelection, setBulkSelection] = useState<string[]>([]);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [deleteConfirmCount, setDeleteConfirmCount] = useState<number | null>(null);
  const [deleteConfirmNativeCount, setDeleteConfirmNativeCount] = useState<number>(0);
  const userImageUrls = useUserImageSources(metadata);
  const [draftRights, setDraftRights] = useState({
    creator: '',
    copyrightNotice: '',
    license: '',
    source: 'user'
  });
  const [draftCategoryIds, setDraftCategoryIds] = useState<string[]>([]);
  const [draftSetIds, setDraftSetIds] = useState<string[]>([]);
  const [draftExcluded, setDraftExcluded] = useState(false);

  const setOptions = useMemo(() => {
    const unique = new Map<string, string>();
    metadata.forEach((record) => {
      const setName = getRecordSetLabel(record);
      const key = normalizeSetKey(setName);
      if (!unique.has(key)) {
        unique.set(key, setName);
      }
    });
    return [
      { key: NO_SET_OPTION, label: 'No Set' },
      ...[...unique.entries()].map(([key, label]) => ({ key, label }))
    ];
  }, [metadata]);

  const categoryOptions = useMemo(() => {
    const unique = new Set<string>();
    metadata.forEach((record) => {
      (record.categoryIds ?? record.categories ?? []).forEach((category) => unique.add(category));
    });
    return [NO_CATEGORY_OPTION, ...[...unique].sort()];
  }, [metadata]);

  const activeFilterChips = useMemo(() => {
    const chips = [] as Array<{ key: string; label: string; clear: () => void }>;

    if (originFilter !== EMPTY_FILTER) {
      chips.push({
        key: 'origin',
        label: `Origin: ${originFilter === 'native' ? 'Native' : 'User'}`,
        clear: () => setOriginFilter(EMPTY_FILTER as 'all' | 'native' | 'user')
      });
    }

    if (setFilter !== EMPTY_FILTER) {
      chips.push({
        key: 'set',
        label: `Set: ${setOptions.find((option) => option.key === setFilter)?.label ?? 'Unknown'}`,
        clear: () => setSetFilter(EMPTY_FILTER)
      });
    }

    if (categoryFilter !== EMPTY_FILTER) {
      chips.push({
        key: 'category',
        label: `Category: ${categoryFilter === NO_CATEGORY_OPTION ? 'No Category' : categoryFilter}`,
        clear: () => setCategoryFilter(EMPTY_FILTER)
      });
    }

    return chips;
  }, [categoryFilter, originFilter, setFilter, setOptions]);

  const editingRecord = useMemo(
    () => metadata.find((record) => record.id === editorId) ?? null,
    [editorId, metadata]
  );

  const selectedRecords = useMemo(
    () => metadata.filter((record) => selectedIds.includes(record.id)),
    [metadata, selectedIds]
  );

  const bulkActionLabel = useMemo(() => {
    const nativeCount = selectedRecords.filter((record) => record.origin === 'native').length;
    const userCount = selectedRecords.filter((record) => record.origin === 'user').length;

    if (nativeCount > 0 && userCount === 0) return 'Exclude';
    if (userCount > 0 && nativeCount === 0) return 'Delete';
    if (nativeCount > 0 && userCount > 0) return 'Delete/Exclude';
    return 'Delete/Exclude';
  }, [selectedRecords]);

  useEffect(() => {
    if (!editingRecord) {
      setDraftRights({ creator: '', copyrightNotice: '', license: '', source: 'user' });
      setDraftCategoryIds([]);
      setDraftSetIds([]);
      setDraftExcluded(false);
      return;
    }

    setDraftRights({
      creator: editingRecord.rights?.creator ?? '',
      copyrightNotice: editingRecord.rights?.copyrightNotice ?? '',
      license: editingRecord.rights?.license ?? '',
      source: editingRecord.rights?.source ?? 'user'
    });
    setDraftCategoryIds(editingRecord.categoryIds ?? editingRecord.categories ?? []);
    setDraftSetIds(
      (editingRecord.setIds ?? (editingRecord.setName ? [editingRecord.setName] : [])).map((value) => normalizeSetKey(value))
    );
    setDraftExcluded(Boolean(editingRecord.excluded));
  }, [editingRecord]);

  const formatDisplayFileName = (record: ImageRecord): string => {
    const rawName = record.fileName ?? record.file ?? '';
    const baseName = rawName.split('/').at(-1)?.replace(/\.[^/.]+$/, '') ?? rawName;
    const compactName = baseName.length > 15 ? `${baseName.slice(0, 15)}...` : baseName;
    return compactName || 'Untitled';
  };

  const filteredRecords = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return metadata.filter((record) => {
      const matchesOrigin = originFilter === EMPTY_FILTER || record.origin === originFilter;
      const recordSet = getRecordSetLabel(record);
      const recordSetKey = normalizeSetKey(recordSet);
      const hasSet = Boolean(record.setIds?.length || record.setName);
      const matchesSet =
        setFilter === EMPTY_FILTER ||
        (setFilter === NO_SET_OPTION ? !hasSet : recordSetKey === setFilter);
      const recordCategories = record.categoryIds ?? record.categories ?? [];
      const matchesCategory =
        categoryFilter === EMPTY_FILTER ||
        (categoryFilter === NO_CATEGORY_OPTION ? recordCategories.length === 0 : recordCategories.includes(categoryFilter));
      const fileName = (record.fileName ?? record.file ?? '').toLowerCase();
      const matchesSearch = !search || fileName.includes(search);

      return matchesOrigin && matchesSet && matchesCategory && matchesSearch;
    });
  }, [categoryFilter, metadata, originFilter, searchTerm, setFilter]);

  const allSelected = filteredRecords.length > 0 && filteredRecords.every((record) => selectedIds.includes(record.id));

  const toggleSelected = (recordId: string): void => {
    setSelectedIds((previous) =>
      previous.includes(recordId) ? previous.filter((id) => id !== recordId) : [...previous, recordId]
    );
  };

  const toggleAllVisible = (): void => {
    if (allSelected) {
      setSelectedIds((previous) => previous.filter((id) => !filteredRecords.some((record) => record.id === id)));
      return;
    }

    const nextIds = Array.from(new Set([...selectedIds, ...filteredRecords.map((record) => record.id)]));
    setSelectedIds(nextIds);
  };

  const removeDraftCategory = (category: string): void => {
    setDraftCategoryIds((previous) => previous.filter((value) => value !== category));
  };

  const removeDraftSet = (setId: string): void => {
    const normalizedSetId = normalizeSetKey(setId);
    setDraftSetIds((previous) => previous.filter((value) => normalizeSetKey(value) !== normalizedSetId));
  };

  const toggleDraftCategory = (category: string): void => {
    setDraftCategoryIds((previous) =>
      previous.includes(category) ? previous.filter((value) => value !== category) : [...previous, category]
    );
  };

  const toggleDraftSet = (setId: string): void => {
    const normalizedSetId = normalizeSetKey(setId);
    setDraftSetIds((previous) =>
      previous.some((value) => normalizeSetKey(value) === normalizedSetId)
        ? previous.filter((value) => normalizeSetKey(value) !== normalizedSetId)
        : [...previous, normalizedSetId]
    );
  };

  const saveEditor = async (): Promise<void> => {
    if (!editingRecord) {
      return;
    }

    const nextUpdatedAt = new Date().toISOString();
    const sanitizedCategories = draftCategoryIds.filter((category) => category && category !== NO_CATEGORY_OPTION);
    const sanitizedSets = draftSetIds.filter((setKey) => setKey && setKey !== NO_SET_OPTION);

    if (editingRecord.origin === 'native') {
      await saveNativeImageOverride({
        imageId: editingRecord.id,
        setIds: sanitizedSets,
        categoryIds: sanitizedCategories,
        excluded: draftExcluded,
        updatedAt: nextUpdatedAt
      });
    } else {
      const nextRecord: ImageRecord = {
        ...editingRecord,
        setIds: sanitizedSets,
        setName: sanitizedSets[0] ?? undefined,
        categoryIds: sanitizedCategories,
        categories: sanitizedCategories,
        excluded: draftExcluded,
        rights: {
          creator: draftRights.creator,
          copyrightNotice: draftRights.copyrightNotice,
          license: draftRights.license,
          source: draftRights.source || 'user'
        },
        updatedAt: nextUpdatedAt
      };

      await saveUserImage(nextRecord);
    }

    setEditorId(null);
    onRefreshMetadata?.();
  };

  const applySelected = async (excluded: boolean): Promise<void> => {
    if (selectedIds.length === 0) {
      return;
    }

    const selected = metadata.filter((record) => selectedIds.includes(record.id));

    for (const record of selected) {
      if (record.origin === 'native') {
        await saveNativeImageOverride({
          imageId: record.id,
          setIds: record.setIds ?? (record.setName ? [record.setName] : []),
          categoryIds: record.categoryIds ?? record.categories ?? [],
          excluded,
          updatedAt: new Date().toISOString()
        });
      } else {
        await setImageExcluded(record.id, excluded);
      }
    }

    setSelectedIds([]);
    onRefreshMetadata?.();
  };

  const confirmDeleteSelected = async (): Promise<void> => {
    if (deleteConfirmCount === null) return;

    const selected = metadata.filter((record) => selectedIds.includes(record.id));
    const selectedUser = selected.filter((record) => record.origin === 'user');
    const selectedNative = selected.filter((record) => record.origin === 'native');

    for (const record of selectedUser) {
      await deleteUserImage(record.id);
    }

    for (const record of selectedNative) {
      await saveNativeImageOverride({
        imageId: record.id,
        setIds: record.setIds ?? (record.setName ? [record.setName] : []),
        categoryIds: record.categoryIds ?? record.categories ?? [],
        excluded: true,
        updatedAt: new Date().toISOString()
      });
    }

    setDeleteConfirmCount(null);
    setDeleteConfirmNativeCount(0);
    setSelectedIds([]);
    onRefreshMetadata?.();
  };

  const openBulkModal = (type: 'set' | 'category'): void => {
    setBulkModal(type);
    setBulkSelection([]);
  };

  const applyBulkSelection = async (): Promise<void> => {
    if (!bulkModal || selectedIds.length === 0) {
      return;
    }

    const selected = metadata.filter((record) => selectedIds.includes(record.id));
    const nextValues = bulkSelection.filter((value) => {
      if (bulkModal === 'set') {
        return value !== NO_SET_OPTION && value.trim().length > 0;
      }
      return value !== NO_CATEGORY_OPTION && value.trim().length > 0;
    });

    if (nextValues.length === 0) {
      setBulkModal(null);
      return;
    }

    for (const record of selected) {
      if (bulkModal === 'set') {
        const existing = (record.setIds && record.setIds.length > 0 ? record.setIds : record.setName ? [record.setName] : [])
          .filter((value) => Boolean(value) && value !== NO_SET_OPTION);
        const merged = Array.from(new Set([...existing, ...nextValues]));

        if (record.origin === 'native') {
          await saveNativeImageOverride({
            imageId: record.id,
            setIds: merged,
            categoryIds: record.categoryIds ?? record.categories ?? [],
            excluded: Boolean(record.excluded),
            updatedAt: new Date().toISOString()
          });
        } else {
          await saveUserImage({
            ...record,
            setIds: merged,
            setName: merged[0] ?? undefined,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        const existing = (record.categoryIds ?? record.categories ?? []).filter((value) => Boolean(value));
        const merged = Array.from(new Set([...existing, ...nextValues]));

        if (record.origin === 'native') {
          await saveNativeImageOverride({
            imageId: record.id,
            setIds: record.setIds ?? (record.setName ? [record.setName] : []),
            categoryIds: merged,
            excluded: Boolean(record.excluded),
            updatedAt: new Date().toISOString()
          });
        } else {
          await saveUserImage({
            ...record,
            categoryIds: merged,
            categories: merged,
            updatedAt: new Date().toISOString()
          });
        }
      }
    }

    setBulkModal(null);
    setBulkSelection([]);
    setSelectedIds([]);
    onRefreshMetadata?.();
  };

  const triggerBulkAction = async (): Promise<void> => {
    if (selectedIds.length === 0) {
      return;
    }

    const selected = metadata.filter((record) => selectedIds.includes(record.id));
    const nativeSelected = selected.filter((record) => record.origin === 'native').length;
    const userSelected = selected.filter((record) => record.origin === 'user').length;

    if (nativeSelected > 0 && userSelected === 0) {
      await applySelected(true);
      return;
    }

    if (userSelected > 0 && nativeSelected === 0) {
      setDeleteConfirmNativeCount(0);
      setDeleteConfirmCount(userSelected);
      return;
    }

    setDeleteConfirmNativeCount(nativeSelected);
    setDeleteConfirmCount(userSelected);
  };

  return (
    <main className="image-manager-page">
      <div className="image-manager-top">
        <div className="image-manager-toolbar">
          <button type="button" className="icon-button" onClick={() => navigate('/settings')} aria-label="Back to settings">
            <ArrowLeftIcon />
          </button>

          <button type="button" className="icon-button" onClick={() => setShowFilterModal(true)} aria-label="Open filters">
            <FilterIcon />
          </button>

          <input
            type="search"
            className="image-manager-search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by file name"
            aria-label="Search images by file name"
          />
        </div>

        {activeFilterChips.length > 0 ? (
          <div className="image-manager-chip-row" aria-live="polite">
            {activeFilterChips.map((chip) => (
              <span key={chip.key} className="filter-chip">
                <span>{chip.label}</span>
                <button type="button" className="filter-chip-remove" onClick={chip.clear} aria-label={`Remove ${chip.label}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {selectedIds.length > 0 ? (
          <div className="bulk-toolbar">
            <button type="button" className="action-button" onClick={() => openBulkModal('set')}>
              Add to Set
            </button>
            <button type="button" className="action-button" onClick={() => openBulkModal('category')}>
              Add to Category
            </button>
            <button type="button" className="action-button danger-button" onClick={() => void triggerBulkAction()}>
              {bulkActionLabel}
            </button>
          </div>
        ) : null}
      </div>

      <section className="settings-section image-manager-table-wrap">
        <div className="image-manager-table">
          <div className="image-manager-row image-manager-header-row">
            <span className="table-check">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAllVisible}
                aria-label="Toggle visible images"
              />
            </span>
            <span>Image</span>
            <span>File</span>
            <span>Sets</span>
            <span>Categories</span>
            <span>Action</span>
          </div>

          {filteredRecords.map((record) => {
            const imgUrl = getRecordImageSource(record, userImageUrls);
            const sets = (record.setIds && record.setIds.length > 0 ? record.setIds : record.setName ? [record.setName] : [NO_SET_OPTION])
              .filter(Boolean)
              .map((value) => (value === NO_SET_OPTION ? 'No Set' : value));
            const categories = (record.categoryIds && record.categoryIds.length > 0 ? record.categoryIds : record.categories ?? [])
              .filter(Boolean);

            return (
              <div
                key={record.id}
                className={`image-manager-row image-manager-item-row${record.excluded ? ' is-hidden' : ''}`}
              >
                <span className="table-check">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(record.id)}
                    onChange={() => toggleSelected(record.id)}
                    aria-label={`Select ${record.id}`}
                  />
                </span>
                <span className="thumbnail-cell">
                  <img src={imgUrl} alt={record.id} loading="lazy" />
                </span>
                <span className="file-name-cell">{formatDisplayFileName(record)}</span>
                <span>{sets.length > 0 ? sets.join(', ') : 'No Set'}</span>
                <span>{categories.length > 0 ? categories.join(', ') : 'No Category'}</span>
                <span>
                  <button type="button" className="action-button compact" onClick={() => setEditorId(record.id)}>
                    Edit
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {showFilterModal ? (
        <div className="modal-overlay" onClick={() => setShowFilterModal(false)}>
          <div className="modal filter-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Filters</h2>
              <button type="button" className="icon-button small-icon" onClick={() => setShowFilterModal(false)} aria-label="Close filters">
                <CloseIcon />
              </button>
            </div>

            <div className="image-manager-filters modal-filters">
              <label>
                Origin
                <select value={originFilter} onChange={(event) => setOriginFilter(event.target.value as 'all' | 'native' | 'user')}>
                  <option value="all">All</option>
                  <option value="native">Native</option>
                  <option value="user">User</option>
                </select>
              </label>

              <label>
                Set
                <select value={setFilter} onChange={(event) => setSetFilter(event.target.value)}>
                  <option value={EMPTY_FILTER}>All sets</option>
                  {setOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Category
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value={EMPTY_FILTER}>All categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category === NO_CATEGORY_OPTION ? 'No Category' : category}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      ) : null}

      {bulkModal ? (
        <div className="modal-overlay" onClick={() => setBulkModal(null)}>
          <div className="modal filter-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{bulkModal === 'set' ? 'Add to set' : 'Add to category'}</h2>
              <button type="button" className="icon-button small-icon" onClick={() => setBulkModal(null)} aria-label="Close bulk modal">
                <CloseIcon />
              </button>
            </div>

            <div className="tag-list checkbox-grid">
              {(bulkModal === 'set' ? setOptions : categoryOptions).map((option) => {
                const value = typeof option === 'string' ? option : option.key;
                const label = typeof option === 'string' ? option : option.label;
                const isSelected = bulkSelection.includes(value);
                return (
                  <label key={value} className="checkbox-label checkbox-card">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setBulkSelection((previous) =>
                          previous.includes(value)
                            ? previous.filter((candidate) => candidate !== value)
                            : [...previous, value]
                        );
                      }}
                    />
                    {bulkModal === 'set' ? (value === NO_SET_OPTION ? 'No Set' : label) : value === NO_CATEGORY_OPTION ? 'No Category' : label}
                  </label>
                );
              })}
            </div>

            <div className="modal-actions">
              <button type="button" className="action-button" onClick={() => void applyBulkSelection()}>
                Apply to selected
              </button>
              <button type="button" className="action-button" onClick={() => setBulkModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmCount !== null ? (
        <div className="modal-overlay" onClick={() => setDeleteConfirmCount(null)}>
          <div className="modal confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm delete</h2>
              <button type="button" className="icon-button small-icon" onClick={() => setDeleteConfirmCount(null)} aria-label="Close delete confirmation">
                <CloseIcon />
              </button>
            </div>

            <p>
              Permanently delete {deleteConfirmCount} user image{deleteConfirmCount === 1 ? '' : 's'}?
              {deleteConfirmNativeCount > 0 ? ` This will also hide ${deleteConfirmNativeCount} native image${deleteConfirmNativeCount === 1 ? '' : 's'} from reels.` : ''}
            </p>

            <div className="modal-actions">
              <button type="button" className="action-button danger-button" onClick={() => void confirmDeleteSelected()}>
                Yes, delete
              </button>
              <button type="button" className="action-button" onClick={() => setDeleteConfirmCount(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingRecord ? (
        <div className="modal-overlay" onClick={() => setEditorId(null)}>
          <section className="modal image-editor-panel" onClick={(event) => event.stopPropagation()}>
            <div className="image-editor-header">
              <div className="image-editor-header-main">
                <h2>Edit {editingRecord.fileName ?? editingRecord.file}</h2>
                {editingRecord.origin === 'native' && draftExcluded ? (
                  <span className="excluded-from-reels-status">Excluded from Reels</span>
                ) : null}
              </div>
              <button type="button" className="icon-button small-icon" onClick={() => setEditorId(null)} aria-label="Close editor">
                <CloseIcon />
              </button>
            </div>

            <div className="image-editor-grid">
              <div className="image-editor-card">
                <img src={getRecordImageSource(editingRecord, userImageUrls)} alt={editingRecord.id} className="editor-preview" />
              </div>

              <div className="image-editor-card">
                {editingRecord.origin === 'user' ? (
                  <>
                    <label>
                      Creator
                      <input
                        type="text"
                        value={draftRights.creator}
                        onChange={(event) => setDraftRights((previous) => ({ ...previous, creator: event.target.value }))}
                      />
                    </label>
                    <label>
                      Copyright notice
                      <input
                        type="text"
                        value={draftRights.copyrightNotice}
                        onChange={(event) => setDraftRights((previous) => ({ ...previous, copyrightNotice: event.target.value }))}
                      />
                    </label>
                    <label>
                      License
                      <input
                        type="text"
                        value={draftRights.license}
                        onChange={(event) => setDraftRights((previous) => ({ ...previous, license: event.target.value }))}
                      />
                    </label>
                  </>
                ) : (
                  <aside className="image-rights-footer image-editor-rights-footer">
                    <p>{editingRecord.rights?.copyrightNotice || 'No copyright notice'}</p>
                    <p>{editingRecord.rights?.license || 'No license specified'}</p>
                  </aside>
                )}
              </div>

              <div className="image-editor-card">
                <h3>Categories</h3>
                <div className="taxonomy-chip-list">
                  {draftCategoryIds.length > 0 ? (
                    draftCategoryIds.map((category) => (
                      <span key={category} className="taxonomy-chip">
                        <span>{category}</span>
                        <button type="button" className="chip-remove" aria-label={`Remove ${category}`} onClick={() => removeDraftCategory(category)}>
                          ×
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="muted-text">No categories selected</span>
                  )}
                </div>
                <div className="chip-select-row">
                  <select
                    value=""
                    aria-label="Add to Category"
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue) {
                        toggleDraftCategory(nextValue);
                        event.target.value = '';
                      }
                    }}
                  >
                    <option value="">Add to Category</option>
                    {categoryOptions
                      .filter((category) => category !== NO_CATEGORY_OPTION)
                      .filter((category) => !draftCategoryIds.includes(category))
                      .map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="image-editor-card">
                <h3>Sets</h3>
                <div className="taxonomy-chip-list">
                  {draftSetIds.length > 0 ? (
                    draftSetIds.map((setId) => {
                      const label = setOptions.find((option) => normalizeSetKey(option.key) === normalizeSetKey(setId))?.label ?? setId;
                      return (
                        <span key={setId} className="taxonomy-chip">
                          <span>{label}</span>
                          <button type="button" className="chip-remove" aria-label={`Remove ${label}`} onClick={() => removeDraftSet(setId)}>
                            ×
                          </button>
                        </span>
                      );
                    })
                  ) : (
                    <span className="muted-text">No sets selected</span>
                  )}
                </div>
                <div className="chip-select-row">
                  <select
                    value=""
                    aria-label="Add to Set"
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue) {
                        toggleDraftSet(nextValue);
                        event.target.value = '';
                      }
                    }}
                  >
                    <option value="">Add to Set</option>
                    {setOptions
                      .filter((option) => option.key !== NO_SET_OPTION)
                      .filter((option) => !draftSetIds.some((value) => normalizeSetKey(value) === option.key))
                      .map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="editor-actions">
              <div className="editor-actions-left">
                {editingRecord.origin === 'native' ? (
                  <button
                    type="button"
                    className={`action-button compact ${draftExcluded ? 'secondary-button' : 'danger-button'}`}
                    onClick={() => setDraftExcluded((previous) => !previous)}
                  >
                    {draftExcluded ? 'Include' : 'Exclude'}
                  </button>
                ) : null}
              </div>

              <div className="editor-actions-right">
                <button type="button" className="action-button" onClick={() => setEditorId(null)}>
                  Cancel
                </button>
                <button type="button" className="action-button" onClick={() => void saveEditor()}>
                  Save changes
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
};
