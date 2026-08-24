import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { buildEffectiveMetadata, loadMetadata } from './lib/metadata';
import { createInitialRepeatState } from './lib/randomizer';
import { loadSettings, saveSettings } from './lib/storage';
import { loadNativeImageOverrides, listUserImages } from './lib/userStorage';
import { ImageManagementPage } from './pages/ImageManagementPage';
import { PracticePage } from './pages/PracticePage';
import { SettingsPage } from './pages/SettingsPage';
import type { ImageRecord, SettingsState } from './types';

const repeatState = createInitialRepeatState();

export const App = () => {
  const [settings, setSettings] = useState<SettingsState>(() => loadSettings());
  const [metadata, setMetadata] = useState<ImageRecord[]>([]);
  const [metadataError, setMetadataError] = useState<string>('');

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const refreshMetadata = () => {
    Promise.all([loadMetadata(), loadNativeImageOverrides(), listUserImages()])
      .then(([nativeRecords, nativeOverrides, userImages]) => {
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
        <Route path="/" element={<PracticePage settings={settings} metadata={metadata} repeatState={repeatState} />} />
        <Route
          path="/settings"
          element={<SettingsPage settings={settings} metadata={metadata} onChange={setSettings} onRefreshMetadata={refreshMetadata} />}
        />
        <Route
          path="/images"
          element={<ImageManagementPage metadata={metadata} onRefreshMetadata={refreshMetadata} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }, [metadata, metadataError, settings]);

  return view;
};
