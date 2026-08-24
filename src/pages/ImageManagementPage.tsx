import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloseIcon } from '../components/icons';
import { getRecordSetLabel, normalizeSetKey, resolveAssetUrl } from '../lib/metadata';
import { deleteUserImage, saveNativeImageOverride, saveUserImage, setImageExcluded } from '../lib/userStorage';
import type { ImageRecord } from '../types';

interface ImageManagementPageProps {
  metadata: ImageRecord[];
  onRefreshMetadata?: () => void;
}

const EMPTY_FILTER = 'all';
const NO_SET_OPTION = '__no_set__';
const NO_CATEGORY_OPTION = '__no_category__';

export const ImageManagementPage = ({ metadata, onRefreshMetadata }: ImageManagementPageProps) => {
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [originFilter, setOriginFilter] = useState<'all' | 'native' | 'user'>(EMPTY_FILTER as 'all' | 'native' | 'user');
  const [setFilter, setSetFilter] = useState<string>(EMPTY_FILTER);
  const [categoryFilter, setCategoryFilter] = useState<string>(EMPTY_FILTER);
  const [statusMessage, setStatusMessage] = useState('');
  const [editorId, setEditorId] = useState<string | null>(null);
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

  const editingRecord = useMemo(
    () => metadata.find((record) => record.id === editorId) ?? null,
    [editorId, metadata]
  );

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
    setDraftSetIds(editingRecord.setIds ?? (editingRecord.setName ? [editingRecord.setName] : []));
    setDraftExcluded(Boolean(editingRecord.excluded));
  }, [editingRecord]);

  const filteredRecords = useMemo(() => {
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

      return matchesOrigin && matchesSet && matchesCategory;
    });
  }, [categoryFilter, metadata, originFilter, setFilter]);

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

  const toggleDraftCategory = (category: string): void => {
    setDraftCategoryIds((previous) =>
      previous.includes(category) ? previous.filter((value) => value !== category) : [...previous, category]
    );
  };

  const toggleDraftSet = (setId: string): void => {
    setDraftSetIds((previous) =>
      previous.includes(setId) ? previous.filter((value) => value !== setId) : [...previous, setId]
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
      setStatusMessage(`Updated native image ${editingRecord.id}.`);
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
      setStatusMessage(`Saved user image ${editingRecord.fileName ?? editingRecord.file}.`);
    }

    setEditorId(null);
    onRefreshMetadata?.();
  };

  const applySelected = async (excluded: boolean): Promise<void> => {
    if (selectedIds.length === 0) {
      setStatusMessage('Select at least one image first.');
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

    setStatusMessage(excluded ? 'Selected images hidden from reels.' : 'Selected images restored to reels.');
    setSelectedIds([]);
    onRefreshMetadata?.();
  };

  const deleteSelected = async (): Promise<void> => {
    if (selectedIds.length === 0) {
      setStatusMessage('Select at least one user image to delete.');
      return;
    }

    const selected = metadata.filter((record) => selectedIds.includes(record.id) && record.origin === 'user');
    if (selected.length === 0) {
      setStatusMessage('Only user images can be deleted from this view.');
      return;
    }

    for (const record of selected) {
      await deleteUserImage(record.id);
    }

    setStatusMessage(`Deleted ${selected.length} user image${selected.length === 1 ? '' : 's'}.`);
    setSelectedIds([]);
    onRefreshMetadata?.();
  };

  return (
    <main className="image-manager-page">
      <header className="image-manager-header">
        <div className="header-row">
          <button type="button" className="icon-button" onClick={() => navigate('/settings')} aria-label="Back to settings">
            <CloseIcon />
          </button>
          <h1>Image manager</h1>
        </div>
        <button type="button" className="action-button" onClick={() => navigate('/settings')}>
          Back to settings
        </button>
      </header>

      <section className="settings-section image-manager-controls">
        <div className="image-manager-filters">
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

        <div className="image-manager-actions">
          <button type="button" className="action-button" onClick={toggleAllVisible}>
            {allSelected ? 'Clear selection' : 'Select visible'}
          </button>
          <button type="button" className="action-button" onClick={() => void applySelected(true)}>
            Hide selected
          </button>
          <button type="button" className="action-button" onClick={() => void applySelected(false)}>
            Restore selected
          </button>
          <button type="button" className="action-button" onClick={() => void deleteSelected()}>
            Delete user images
          </button>
        </div>
      </section>

      {statusMessage ? (
        <section className="settings-section muted-text" aria-live="polite">
          {statusMessage}
        </section>
      ) : null}

      <section className="settings-section image-manager-table-wrap">
        <div className="image-manager-table">
          <div className="image-manager-row image-manager-header-row">
            <span className="table-check"><input type="checkbox" checked={allSelected} onChange={toggleAllVisible} aria-label="Toggle visible images" /></span>
            <span>Image</span>
            <span>File</span>
            <span>Origin</span>
            <span>Sets</span>
            <span>Categories</span>
            <span>Action</span>
          </div>

          {filteredRecords.map((record) => {
            const imgUrl = resolveAssetUrl(`images/${record.file}`);
            const sets = (record.setIds && record.setIds.length > 0 ? record.setIds : record.setName ? [record.setName] : [NO_SET_OPTION])
              .filter(Boolean)
              .map((value) => (value === NO_SET_OPTION ? 'No Set' : value));
            const categories = (record.categoryIds && record.categoryIds.length > 0 ? record.categoryIds : record.categories ?? [])
              .filter(Boolean);

            return (
              <div key={record.id} className="image-manager-row image-manager-item-row">
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
                <span className="file-name-cell">{record.fileName ?? record.file}</span>
                <span>{record.origin ?? 'native'}</span>
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

      {editingRecord ? (
        <section className="settings-section image-editor-panel">
          <div className="image-editor-header">
            <h2>Edit {editingRecord.fileName ?? editingRecord.file}</h2>
            <button type="button" className="icon-button small-icon" onClick={() => setEditorId(null)} aria-label="Close editor">
              <CloseIcon />
            </button>
          </div>

          <div className="image-editor-grid">
            <div className="image-editor-card">
              <img src={resolveAssetUrl(`images/${editingRecord.file}`)} alt={editingRecord.id} className="editor-preview" />
            </div>

            <div className="image-editor-card">
              <label>
                Excluded from reels
                <input
                  type="checkbox"
                  checked={draftExcluded}
                  onChange={(event) => setDraftExcluded(event.target.checked)}
                />
              </label>

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
                <p className="muted-text">Native image rights stay locked and are preserved from the bundled metadata.</p>
              )}
            </div>

            <div className="image-editor-card">
              <h3>Categories</h3>
              <div className="tag-list">
                {categoryOptions.map((category) => {
                  const optionValue = category === NO_CATEGORY_OPTION ? '' : category;
                  const isSelected = optionValue ? draftCategoryIds.includes(optionValue) : draftCategoryIds.length === 0;
                  return (
                    <label key={category} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          if (optionValue) {
                            toggleDraftCategory(optionValue);
                          }
                        }}
                      />
                      {category === NO_CATEGORY_OPTION ? 'No Category' : category}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="image-editor-card">
              <h3>Sets</h3>
              <div className="tag-list">
                {setOptions.map((option) => {
                  const isSelected = option.key === NO_SET_OPTION ? draftSetIds.length === 0 : draftSetIds.includes(option.key);
                  return (
                    <label key={option.key} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          if (option.key === NO_SET_OPTION) {
                            setDraftSetIds([]);
                            return;
                          }
                          toggleDraftSet(option.key);
                        }}
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="editor-actions">
            <button type="button" className="action-button" onClick={() => void saveEditor()}>
              Save changes
            </button>
            <button type="button" className="action-button" onClick={() => setEditorId(null)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
};
