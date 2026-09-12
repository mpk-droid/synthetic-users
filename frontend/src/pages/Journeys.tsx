import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJourneys, createJourney } from '../api/client';
import { ImportExportToolbar } from '../components/ImportExportToolbar';
import { useExportSelection } from '../hooks/useExportSelection';
import { readJsonFile } from '../utils/jsonDownload';
import {
  exportJourneysJson,
  importJourneysFromItems,
  validateJourneysImport,
} from '../utils/journeyImportExport';

export default function Journeys() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [importError, setImportError] = useState<string | null>(null);
  const [importPending, setImportPending] = useState(false);

  const { data: journeys, isLoading, error } = useQuery({
    queryKey: ['journeys'],
    queryFn: getJourneys,
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
  } = useExportSelection(journeys);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const createMutation = useMutation({
    mutationFn: () =>
      createJourney({
        name: form.name,
        description: form.description || undefined,
      }),
    onSuccess: (journey) => {
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
      setForm({ name: '', description: '' });
      setShowForm(false);
      navigate(`/journeys/${journey.id}`);
    },
  });

  const handleExportSelected = () => {
    if (!journeys?.length || selectedCount === 0) return;
    exportJourneysJson(journeys, selectedIds);
    cancelExport();
  };

  const handleImportFile = async (file: File) => {
    setImportError(null);
    setImportPending(true);
    try {
      const data = await readJsonFile(file);
      const items = validateJourneysImport(data);
      await importJourneysFromItems(items);
      await queryClient.invalidateQueries({ queryKey: ['journeys'] });
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
    navigate(`/journeys/${id}`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Journeys</h2>
        <ImportExportToolbar
          primaryAction={
            <button className="btn btn--primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : 'New Journey'}
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
        <p className="import-export-hint">Select journeys to export as JSON.</p>
      )}
      {importError && <p className="error import-export-error">{importError}</p>}

      {showForm && (
        <div className="card" style={{ marginBottom: '24px', padding: '20px' }}>
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g., DX Evaluation Journey"
              required
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="What does this journey evaluate?"
            />
          </div>
          <button
            className="btn btn--primary"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.name}
          >
            Create Journey
          </button>
        </div>
      )}

      {isLoading && <p className="loading">Loading journeys...</p>}
      {error && <p className="error">Failed to load journeys.</p>}

      <div className="card-grid">
        {journeys?.map((j) => {
          const selected = selectedIds.has(j.id);
          return (
            <div
              key={j.id}
              className={[
                'card',
                exportMode ? 'card--selectable' : 'card--clickable',
                selected ? 'card--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleCardClick(j.id)}
            >
              {exportMode && (
                <label
                  className="card-select"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelect(j.id)}
                    aria-label={`Select ${j.name}`}
                  />
                </label>
              )}
              <div className="card-header">
                <h3 className="card-title">{j.name}</h3>
                <span className="badge badge--outline">
                  {j.phases.length} phase{j.phases.length !== 1 ? 's' : ''}
                </span>
              </div>
              {j.description && <p className="card-snippet">{j.description}</p>}
            </div>
          );
        })}
      </div>

      {journeys?.length === 0 && !isLoading && (
        <p className="empty-state">No journeys yet. Create one to get started.</p>
      )}
    </div>
  );
}
