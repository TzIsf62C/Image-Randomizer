import { resolveAssetUrl } from '../lib/metadata';
import { capSessionHistory, SESSION_HISTORY_LIMIT } from '../lib/userStorage';
import type { SpinResult } from '../types';
import { CloseIcon } from './icons';

interface HistoryModalProps {
  history: SpinResult[];
  onClose: () => void;
}

export const HistoryModal = ({ history, onClose }: HistoryModalProps) => {
  const visibleHistory = capSessionHistory(history, SESSION_HISTORY_LIMIT);
  const hiddenSpinCount = Math.max(0, history.length - visibleHistory.length);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Spin history">
      <div className="modal">
        <div className="modal-header">
          <h2>History</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close history">
            <CloseIcon />
          </button>
        </div>
        <div className="history-list" aria-live="polite">
          {visibleHistory.length === 0 ? (
            <p className="muted-text">No spins yet.</p>
          ) : (
            <>
              {hiddenSpinCount > 0 ? (
                <p className="muted-text">Showing the newest {visibleHistory.length} of {history.length} spins.</p>
              ) : null}
              {visibleHistory
                .slice()
                .reverse()
                .map((entry) => (
                  <article key={entry.spinNumber} className="history-item">
                    <header>Spin {entry.spinNumber}</header>
                    <div className="history-row">
                      {entry.records.map((record, index) => (
                        <img
                          key={`${entry.spinNumber}-${record.id}-${index}`}
                          src={resolveAssetUrl(`images/${record.file}`)}
                          alt={`Spin ${entry.spinNumber} slot ${index + 1}`}
                          loading="lazy"
                        />
                      ))}
                    </div>
                  </article>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
