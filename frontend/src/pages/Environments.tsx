import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEnvironments, createEnvironment, deleteEnvironment } from '../api/client';

export default function Environments() {
  const queryClient = useQueryClient();
  const { data: environments, isLoading } = useQuery({
    queryKey: ['environments'],
    queryFn: getEnvironments,
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', image: '', description: '' });

  const createMutation = useMutation({
    mutationFn: () =>
      createEnvironment({
        name: form.name,
        image: form.image,
        description: form.description || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environments'] });
      setForm({ name: '', image: '', description: '' });
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEnvironment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['environments'] }),
  });

  if (isLoading) return <p className="loading">Loading environments...</p>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Environments</h2>
        <button className="btn btn--primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add Environment'}
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
              placeholder="e.g., Fedora 40"
              required
            />
          </div>
          <div className="form-group">
            <label>Docker Image</label>
            <input
              type="text"
              value={form.image}
              onChange={(e) => setForm((p) => ({ ...p, image: e.target.value }))}
              placeholder="e.g., quay.io/org/su-fedora:latest"
              required
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="e.g., Fedora 40 with Python 3.12, Node 22"
            />
          </div>
          <button
            className="btn btn--primary"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.name || !form.image}
          >
            Create
          </button>
        </div>
      )}

      <div className="card-grid">
        {environments?.map((env) => (
          <div key={env.id} className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3>{env.name}</h3>
                <code style={{ fontSize: '13px', color: '#888' }}>{env.image}</code>
                {env.description && (
                  <p style={{ fontSize: '14px', color: '#aaa', marginTop: '8px' }}>{env.description}</p>
                )}
              </div>
              {!env.is_builtin && (
                <button
                  className="btn btn--danger-text btn--icon"
                  onClick={() => {
                    if (window.confirm(`Delete environment "${env.name}"?`)) {
                      deleteMutation.mutate(env.id);
                    }
                  }}
                >
                  Del
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {environments?.length === 0 && (
        <p className="empty-state">No environments yet. Add one to simulate different developer machines.</p>
      )}
    </div>
  );
}
