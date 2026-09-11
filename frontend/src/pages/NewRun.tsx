import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getPersonas, getJourneys, getEnvironments, createRun } from '../api/client';
import type { PersonaEnvironmentSpec } from '../types';

export default function NewRun() {
  const navigate = useNavigate();

  const { data: personas } = useQuery({
    queryKey: ['personas'],
    queryFn: getPersonas,
  });

  const { data: journeys } = useQuery({
    queryKey: ['journeys'],
    queryFn: getJourneys,
  });

  const { data: environments } = useQuery({
    queryKey: ['environments'],
    queryFn: getEnvironments,
  });

  const [form, setForm] = useState({
    name: '',
    repo_url: '',
    journey_id: '',
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
  });

  const [personaEnvs, setPersonaEnvs] = useState<Record<string, Set<string>>>({});

  const togglePersona = (personaId: string) => {
    setPersonaEnvs((prev) => {
      const next = { ...prev };
      if (next[personaId]) {
        delete next[personaId];
      } else {
        next[personaId] = new Set<string>();
      }
      return next;
    });
  };

  const toggleEnvForPersona = (personaId: string, envId: string) => {
    setPersonaEnvs((prev) => {
      const next = { ...prev };
      const envs = new Set(next[personaId] || []);
      if (envs.has(envId)) {
        envs.delete(envId);
      } else {
        envs.add(envId);
      }
      next[personaId] = envs;
      return next;
    });
  };

  const buildPersonaEnvironments = (): PersonaEnvironmentSpec[] => {
    return Object.entries(personaEnvs).map(([persona_id, envSet]) => ({
      persona_id,
      environment_ids: Array.from(envSet),
    }));
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createRun({
        name: form.name,
        repo_url: form.repo_url,
        persona_environments: buildPersonaEnvironments(),
        journey_id: form.journey_id,
        model: form.model,
      }),
    onSuccess: (run) => {
      navigate(`/runs/${run.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  const selectedPersonaCount = Object.keys(personaEnvs).length;
  const isValid = form.name && selectedPersonaCount > 0 && form.journey_id && form.repo_url;

  return (
    <div className="page">
      <div className="page-header">
        <h2>New Run</h2>
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Run Name</label>
          <input
            id="name"
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g., Eval run for my-app v2.1"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="repo_url">Repository URL</label>
          <input
            id="repo_url"
            type="text"
            value={form.repo_url}
            onChange={(e) => setForm((p) => ({ ...p, repo_url: e.target.value }))}
            placeholder="https://github.com/org/repo.git"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="journey">Journey</label>
          <select
            id="journey"
            value={form.journey_id}
            onChange={(e) => setForm((p) => ({ ...p, journey_id: e.target.value }))}
            required
          >
            <option value="">Select a journey...</option>
            {journeys?.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name} ({j.phases.length} phases)
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="model">Model</label>
          <input
            id="model"
            type="text"
            placeholder="nvidia/nemotron-3-ultra-550b-a55b"
            value={form.model}
            onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label>Personas &amp; Environments</label>
          <p style={{ fontSize: '14px', color: '#888', marginBottom: '12px' }}>
            Select personas, then optionally pick environments for each. No environment = default image.
          </p>
          <div className="persona-checkbox-grid">
            {personas?.map((p) => {
              const isSelected = personaEnvs[p.id] !== undefined;
              return (
                <div key={p.id} className={`checkbox-card ${isSelected ? 'checkbox-card--selected' : ''}`}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePersona(p.id)}
                    />
                    <div className="checkbox-card-content">
                      <strong>{p.name}</strong>
                      <span className="checkbox-card-meta">{p.expertise_level}</span>
                    </div>
                  </label>
                  {isSelected && environments && environments.length > 0 && (
                    <div style={{ marginTop: '8px', paddingLeft: '24px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {environments.map((env) => (
                        <label
                          key={env.id}
                          style={{
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: personaEnvs[p.id]?.has(env.id) ? '#2a3a2a' : '#252525',
                            border: `1px solid ${personaEnvs[p.id]?.has(env.id) ? '#4a7a4a' : '#333'}`,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={personaEnvs[p.id]?.has(env.id) || false}
                            onChange={() => toggleEnvForPersona(p.id, env.id)}
                            style={{ width: '14px', height: '14px' }}
                          />
                          {env.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {personas?.length === 0 && (
            <p className="empty-state">No personas available. Create some first.</p>
          )}
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={createMutation.isPending || !isValid}
          >
            {createMutation.isPending ? 'Starting...' : 'Start Run'}
          </button>
        </div>
        {createMutation.isError && (
          <p className="error">Failed to create run: {(createMutation.error as Error).message}</p>
        )}
      </form>
    </div>
  );
}
