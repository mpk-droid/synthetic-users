import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getJourney,
  updateJourney,
  deleteJourney,
  createJourneyPhase,
  updateJourneyPhase,
  deleteJourneyPhase,
} from '../api/client';
import type { JourneyPhaseResponse } from '../types';

interface PhaseFormData {
  name: string;
  instructions: string;
  available_tools: string;
  requires_target_running: boolean;
}

const emptyPhaseForm: PhaseFormData = {
  name: '',
  instructions: '',
  available_tools: '',
  requires_target_running: false,
};

export default function JourneyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: journey, isLoading, error } = useQuery({
    queryKey: ['journey', id],
    queryFn: () => getJourney(id!),
    enabled: !!id,
  });

  const [journeyForm, setJourneyForm] = useState({ name: '', description: '' });
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [phaseForm, setPhaseForm] = useState<PhaseFormData>(emptyPhaseForm);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [editPhaseForm, setEditPhaseForm] = useState<PhaseFormData>(emptyPhaseForm);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (journey) {
      setJourneyForm({ name: journey.name, description: journey.description || '' });
    }
  }, [journey]);

  const updateJourneyMutation = useMutation({
    mutationFn: () => updateJourney(id!, journeyForm),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journey', id] }),
  });

  const deleteJourneyMutation = useMutation({
    mutationFn: () => deleteJourney(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
      navigate('/journeys');
    },
  });

  const addPhaseMutation = useMutation({
    mutationFn: () =>
      createJourneyPhase(id!, {
        name: phaseForm.name,
        instructions: phaseForm.instructions,
        available_tools: phaseForm.available_tools
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        requires_target_running: phaseForm.requires_target_running,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journey', id] });
      setPhaseForm(emptyPhaseForm);
      setShowAddPhase(false);
    },
  });

  const updatePhaseMutation = useMutation({
    mutationFn: (phaseId: string) =>
      updateJourneyPhase(id!, phaseId, {
        name: editPhaseForm.name,
        instructions: editPhaseForm.instructions,
        available_tools: editPhaseForm.available_tools
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        requires_target_running: editPhaseForm.requires_target_running,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journey', id] });
      setEditingPhaseId(null);
    },
  });

  const deletePhaseMutation = useMutation({
    mutationFn: (phaseId: string) => deleteJourneyPhase(id!, phaseId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journey', id] }),
  });

  const movePhase = (phase: JourneyPhaseResponse, direction: 'up' | 'down') => {
    const newOrder = direction === 'up' ? phase.order - 1 : phase.order + 1;
    updateJourneyPhase(id!, phase.id, { order: newOrder }).then(() =>
      queryClient.invalidateQueries({ queryKey: ['journey', id] }),
    );
  };

  const toggleExpand = (phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  const startEditPhase = (phase: JourneyPhaseResponse) => {
    setEditingPhaseId(phase.id);
    setEditPhaseForm({
      name: phase.name,
      instructions: phase.instructions,
      available_tools: phase.available_tools.join(', '),
      requires_target_running: phase.requires_target_running,
    });
  };

  if (isLoading) return <p className="loading">Loading journey...</p>;
  if (error) return <p className="error">Failed to load journey.</p>;
  if (!journey) return null;

  const sortedPhases = [...journey.phases].sort((a, b) => a.order - b.order);

  return (
    <div className="page">
      <div className="page-header">
        <h2>{journey.name}</h2>
      </div>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          updateJourneyMutation.mutate();
        }}
      >
        <div className="form-group">
          <label htmlFor="j-name">Name</label>
          <input
            id="j-name"
            type="text"
            value={journeyForm.name}
            onChange={(e) => setJourneyForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="j-desc">Description</label>
          <textarea
            id="j-desc"
            rows={3}
            value={journeyForm.description}
            onChange={(e) => setJourneyForm((p) => ({ ...p, description: e.target.value }))}
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={updateJourneyMutation.isPending}>
            Save Journey
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              if (window.confirm('Delete this journey?')) deleteJourneyMutation.mutate();
            }}
          >
            Delete Journey
          </button>
        </div>
        {updateJourneyMutation.isSuccess && <p className="form-success">Saved.</p>}
      </form>

      <section className="section">
        <div className="section-header">
          <h3>Phases ({sortedPhases.length})</h3>
          <button className="btn btn--secondary" onClick={() => setShowAddPhase(!showAddPhase)}>
            {showAddPhase ? 'Cancel' : 'Add Phase'}
          </button>
        </div>

        {showAddPhase && (
          <div className="phase-form card">
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={phaseForm.name}
                onChange={(e) => setPhaseForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Instructions</label>
              <textarea
                rows={4}
                value={phaseForm.instructions}
                onChange={(e) => setPhaseForm((p) => ({ ...p, instructions: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Available Tools (comma-separated)</label>
              <input
                type="text"
                value={phaseForm.available_tools}
                onChange={(e) => setPhaseForm((p) => ({ ...p, available_tools: e.target.value }))}
                placeholder="e.g., browser, file_reader"
              />
            </div>
            <div className="form-group form-group--checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={phaseForm.requires_target_running}
                  onChange={(e) =>
                    setPhaseForm((p) => ({ ...p, requires_target_running: e.target.checked }))
                  }
                />
                Requires target running
              </label>
            </div>
            <button
              className="btn btn--primary"
              onClick={() => addPhaseMutation.mutate()}
              disabled={addPhaseMutation.isPending || !phaseForm.name}
            >
              Add Phase
            </button>
          </div>
        )}

        <div className="phase-list">
          {sortedPhases.map((phase, idx) => (
            <div key={phase.id} className="phase-item card">
              {editingPhaseId === phase.id ? (
                <div className="phase-edit">
                  <div className="form-group">
                    <label>Name</label>
                    <input
                      type="text"
                      value={editPhaseForm.name}
                      onChange={(e) => setEditPhaseForm((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Instructions</label>
                    <textarea
                      rows={4}
                      value={editPhaseForm.instructions}
                      onChange={(e) =>
                        setEditPhaseForm((p) => ({ ...p, instructions: e.target.value }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Available Tools (comma-separated)</label>
                    <input
                      type="text"
                      value={editPhaseForm.available_tools}
                      onChange={(e) =>
                        setEditPhaseForm((p) => ({ ...p, available_tools: e.target.value }))
                      }
                    />
                  </div>
                  <div className="form-group form-group--checkbox">
                    <label>
                      <input
                        type="checkbox"
                        checked={editPhaseForm.requires_target_running}
                        onChange={(e) =>
                          setEditPhaseForm((p) => ({
                            ...p,
                            requires_target_running: e.target.checked,
                          }))
                        }
                      />
                      Requires target running
                    </label>
                  </div>
                  <div className="form-actions">
                    <button
                      className="btn btn--primary"
                      onClick={() => updatePhaseMutation.mutate(phase.id)}
                      disabled={updatePhaseMutation.isPending}
                    >
                      Save
                    </button>
                    <button className="btn btn--secondary" onClick={() => setEditingPhaseId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="phase-header" onClick={() => toggleExpand(phase.id)}>
                    <div className="phase-header-left">
                      <span className="phase-order">{phase.order}</span>
                      <h4 className="phase-name">{phase.name}</h4>
                      {phase.requires_target_running && (
                        <span className="badge badge--outline">requires target</span>
                      )}
                    </div>
                    <div className="phase-header-right">
                      <button
                        className="btn btn--icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePhase(phase, 'up');
                        }}
                        disabled={idx === 0}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        className="btn btn--icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePhase(phase, 'down');
                        }}
                        disabled={idx === sortedPhases.length - 1}
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        className="btn btn--icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditPhase(phase);
                        }}
                        title="Edit"
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn--icon btn--danger-text"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('Delete this phase?')) deletePhaseMutation.mutate(phase.id);
                        }}
                        title="Delete"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                  {expandedPhases.has(phase.id) && (
                    <div className="phase-body">
                      <p className="phase-instructions">{phase.instructions}</p>
                      {phase.available_tools.length > 0 && (
                        <div className="phase-tools">
                          <strong>Tools:</strong>{' '}
                          {phase.available_tools.map((t) => (
                            <span key={t} className="badge badge--outline">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {sortedPhases.length === 0 && (
          <p className="empty-state">No phases yet. Add one to get started.</p>
        )}
      </section>
    </div>
  );
}
