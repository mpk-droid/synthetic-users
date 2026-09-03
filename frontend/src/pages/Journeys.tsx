import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJourneys, createJourney } from '../api/client';

export default function Journeys() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: journeys, isLoading, error } = useQuery({
    queryKey: ['journeys'],
    queryFn: getJourneys,
  });

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

  return (
    <div className="page">
      <div className="page-header">
        <h2>Journeys</h2>
        <button className="btn btn--primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'New Journey'}
        </button>
      </div>

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
        {journeys?.map((j) => (
          <div
            key={j.id}
            className="card card--clickable"
            onClick={() => navigate(`/journeys/${j.id}`)}
          >
            <div className="card-header">
              <h3 className="card-title">{j.name}</h3>
              <span className="badge badge--outline">
                {j.phases.length} phase{j.phases.length !== 1 ? 's' : ''}
              </span>
            </div>
            {j.description && (
              <p className="card-snippet">{j.description}</p>
            )}
          </div>
        ))}
      </div>

      {journeys?.length === 0 && !isLoading && (
        <p className="empty-state">No journeys yet. Create one to get started.</p>
      )}
    </div>
  );
}
