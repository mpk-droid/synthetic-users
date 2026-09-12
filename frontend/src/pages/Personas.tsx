import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getPersonas } from '../api/client';
import { ImportExportToolbar } from '../components/ImportExportToolbar';
import { useExportSelection } from '../hooks/useExportSelection';
import { readJsonFile } from '../utils/jsonDownload';
import {
  exportPersonasJson,
  importPersonasFromItems,
  validatePersonasImport,
} from '../utils/personaImportExport';

export default function Personas() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [importError, setImportError] = useState<string | null>(null);
  const [importPending, setImportPending] = useState(false);

  const { data: personas, isLoading, error } = useQuery({
    queryKey: ['personas'],
    queryFn: getPersonas,
  });

  const {
    exportMode,
    selectedIds,
    selectedCount,
    allSelected,
    startExport,
    cancelExport,
    toggleSelect,
    toggleSelectAll,
  } = useExportSelection(personas);

  const handleExportSelected = () => {
    if (!personas?.length || selectedCount === 0) return;
    exportPersonasJson(personas, selectedIds);
    cancelExport();
  };

  const handleImportFile = async (file: File) => {
    setImportError(null);
    setImportPending(true);
    try {
      const data = await readJsonFile(file);
      const items = validatePersonasImport(data);
      await importPersonasFromItems(items);
      await queryClient.invalidateQueries({ queryKey: ['personas'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed.';
      setImportError(message);
    } finally {
      setImportPending(false);
    }
  };

  const handleCardClick = (id: string) => {
    if (exportMode) {
      toggleSelect(id);
      return;
    }
    navigate(`/personas/${id}`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Personas</h2>
        <ImportExportToolbar
          primaryAction={
            <button className="btn btn--primary" onClick={() => navigate('/personas/new')}>
              Create Persona
            </button>
          }
          exportMode={exportMode}
          selectedCount={selectedCount}
          allSelected={allSelected}
          importPending={importPending}
          onStartExport={startExport}
          onCancelExport={cancelExport}
          onToggleSelectAll={toggleSelectAll}
          onExportSelected={handleExportSelected}
          onImportFile={handleImportFile}
        />
      </div>

      {exportMode && (
        <p className="import-export-hint">Select personas to export as JSON.</p>
      )}
      {importError && <p className="error import-export-error">{importError}</p>}

      {isLoading && <p className="loading">Loading personas...</p>}
      {error && <p className="error">Failed to load personas.</p>}

      <div className="card-grid">
        {personas?.map((p) => {
          const selected = selectedIds.has(p.id);
          return (
            <div
              key={p.id}
              className={[
                'card',
                exportMode ? 'card--selectable' : 'card--clickable',
                selected ? 'card--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleCardClick(p.id)}
            >
              {exportMode && (
                <label
                  className="card-select"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelect(p.id)}
                    aria-label={`Select ${p.name}`}
                  />
                </label>
              )}
              <div className="card-header">
                <h3 className="card-title">{p.name}</h3>
                <span
                  className={`badge ${p.prompt_approved ? 'badge--green' : 'badge--gray'}`}
                >
                  {p.prompt_approved ? 'Approved' : 'Unapproved'}
                </span>
              </div>
              <div className="card-meta">
                <span className="badge badge--outline">{p.role_label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {personas?.length === 0 && !isLoading && (
        <p className="empty-state">No personas yet.</p>
      )}
    </div>
  );
}
