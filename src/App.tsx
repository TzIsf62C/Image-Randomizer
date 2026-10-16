import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { buildEffectiveMetadata, loadMetadata } from './lib/metadata';
import { createInitialRepeatState } from './lib/randomizer';
import { EMPTY_TAXONOMY, loadTaxonomy, type Taxonomy } from './lib/taxonomy';
import { loadSettings, saveSettings } from './lib/storage';
import { loadNativeImageOverrides, listUserImages } from './lib/userStorage';
import { ImageManagementPage } from './pages/ImageManagementPage';
import { PracticePage } from './pages/PracticePage';
import { SettingsPage, type SettingsView } from './pages/SettingsPage';
import type { ImageRecord, SettingsState } from './types';

const SETTINGS_ROUTES: Array<[string, SettingsView]> = [
  ['/images/add', 'add-images'],
  ['/practice/configure', 'configure'],
  ['/library', 'library'],
  ['/export', 'export'],
  ['/settings', 'settings']
];

const repeatState = createInitialRepeatState();

export const App = () => {
  const [settings, setSettings] = useState<SettingsState>(() => loadSettings());
  const [metadata, setMetadata] = useState<ImageRecord[]>([]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy>(EMPTY_TAXONOMY);
  const [metadataError, setMetadataError] = useState<string>('');

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const refreshMetadata = () => {
    Promise.all([loadMetadata(), loadNativeImageOverrides(), listUserImages(), loadTaxonomy()])
      .then(([nativeRecords, nativeOverrides, userImages, loadedTaxonomy]) => {
        setTaxonomy(loadedTaxonomy);
        setMetadata(buildEffectiveMetadata(nativeRecords, nativeOverrides, userImages));
      })
      .catch(() => {
        setMetadataError('Metadata failed to load.');
      });
  };

  useEffect(() => {
    refreshMetadata();
  }, []);

  const view = useMemo(() => {
    if (metadataError) {
      return <main className="fatal-error">{metadataError}</main>;
    }

    if (metadata.length === 0) {
      return <main className="loading">Loading…</main>;
    }

    return (
      <Routes>
        <Route path="/" element={<PracticePage settings={settings} metadata={metadata} taxonomy={taxonomy} repeatState={repeatState} />} />
        {SETTINGS_ROUTES.map(([path, settingsView]) => (
          <Route
            key={path}
            path={path}
            element={
              <SettingsPage
                view={settingsView}
                settings={settings}
                metadata={metadata}
                taxonomy={taxonomy}
                onChange={setSettings}
                onRefreshMetadata={refreshMetadata}
              />
            }
          />
        ))}
        <Route
          path="/images"
          element={<ImageManagementPage metadata={metadata} taxonomy={taxonomy} onRefreshMetadata={refreshMetadata} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }, [metadata, metadataError, settings, taxonomy]);

  return view;
};
