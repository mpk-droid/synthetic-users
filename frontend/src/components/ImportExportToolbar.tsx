import { useRef } from 'react';
import { IconExport } from './NavIcons';

interface ImportExportToolbarProps {
  primaryAction?: React.ReactNode;
  exportMode: boolean;
  selectedCount: number;
  allSelected: boolean;
  importPending?: boolean;
  onStartExport: () => void;
  onCancelExport: () => void;
  onToggleSelectAll: () => void;
  onExportSelected: () => void;
  onImportFile: (file: File) => void;
}

export function ImportExportToolbar({
  primaryAction,
  exportMode,
  selectedCount,
  allSelected,
  importPending = false,
  onStartExport,
  onCancelExport,
  onToggleSelectAll,
  onExportSelected,
  onImportFile,
}: ImportExportToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      onImportFile(file);
    }
  };

  return (
    <div className="page-header-actions">
      {primaryAction}
      {!exportMode ? (
        <>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importPending}
          >
            {importPending ? 'Importing...' : 'Import'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="import-export-file-input"
            onChange={handleFileChange}
          />
          <button type="button" className="btn btn--secondary" onClick={onStartExport}>
            <IconExport className="btn__icon" />
            Export
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn--secondary" onClick={onToggleSelectAll}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={onCancelExport}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onExportSelected}
            disabled={selectedCount === 0}
          >
            <IconExport className="btn__icon" />
            Export selected ({selectedCount})
          </button>
        </>
      )}
    </div>
  );
}
