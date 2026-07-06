import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloseIcon } from '../components/icons';
import { extractSetOptions, getRecordSetLabel, normalizeSetKey } from '../lib/metadata';
import type { ImageRecord, SettingsState, SlotConfig, SlotTemplate } from '../types';

interface SettingsPageProps {
  metadata: ImageRecord[];
  settings: SettingsState;
  onChange: (next: SettingsState) => void;
}

export const SettingsPage = ({ metadata, settings, onChange }: SettingsPageProps) => {
  const navigate = useNavigate();
  const [templateName, setTemplateName] = useState('');
  const [showImageRights, setShowImageRights] = useState(false);

  const setOptions = useMemo(() => extractSetOptions(metadata), [metadata]);

  const selectedSetKeys = useMemo(
    () => new Set(settings.selectedSetNames.map((setName) => normalizeSetKey(setName))),
    [settings.selectedSetNames]
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    metadata.forEach((record) => record.categories.forEach((category) => set.add(category)));
    return [...set].sort();
  }, [metadata]);

  const eligibleByCategory = useMemo(() => {
    const filtered = metadata.filter((record) => selectedSetKeys.has(normalizeSetKey(getRecordSetLabel(record))));
    const map = new Map<string, number>();

    filtered.forEach((record) => {
      record.categories.forEach((category) => {
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
      slots: [...settings.slots, { id: crypto.randomUUID(), label: '', category: defaultCategory }]
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

  const saveTemplate = (): void => {
    const name = templateName.trim();
    if (!name) return;

    const template: SlotTemplate = {
      id: crypto.randomUUID(),
      name,
      slots: settings.slots
    };

    onChange({ ...settings, templates: [...settings.templates, template] });
    setTemplateName('');
  };

  const loadTemplate = (template: SlotTemplate): void => {
    onChange({ ...settings, slots: template.slots.map((slot) => ({ ...slot, id: crypto.randomUUID() })) });
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
              <img src={`./images/${record.file}`} alt={record.id} loading="lazy" />
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
        <button type="button" onClick={() => navigate('/')} className="action-button">
          Practice
        </button>
      </header>

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
      </section>

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
