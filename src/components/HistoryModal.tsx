import type { SpinResult } from '../types';
import { CloseIcon } from './icons';

interface HistoryModalProps {
  history: SpinResult[];
  onClose: () => void;
}

export const HistoryModal = ({ history, onClose }: HistoryModalProps) => {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Spin history">
      <div className="modal">
        <div className="modal-header">
          <h2>History</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close history">
            <CloseIcon />
          </button>
        </div>
        <div className="history-list">
          {history.length === 0 ? (
            <p className="muted-text">No spins yet.</p>
          ) : (
            history
              .slice()
              .reverse()
              .map((entry) => (
                <article key={entry.spinNumber} className="history-item">
                  <header>Spin {entry.spinNumber}</header>
                  <div className="history-row">
                    {entry.records.map((record, index) => (
                      <img
                        key={`${entry.spinNumber}-${record.id}-${index}`}
                        src={`./images/${record.file}`}
                        alt={`Spin ${entry.spinNumber} slot ${index + 1}`}
                        loading="lazy"
                      />
                    ))}
                  </div>
                </article>
              ))
          )}
        </div>
      </div>
    </div>
  );
};
