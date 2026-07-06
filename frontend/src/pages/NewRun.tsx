import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getPersonas, getJourneys, createJob, getJobRuns } from '../api/client';

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

  const [form, setForm] = useState({
    name: '',
    target_url: '',
    target_dir: '',
    persona_ids: [] as string[],
    journey_id: '',
    model: 'claude-sonnet-4-6',
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const job = await createJob({
        name: form.name,
        target_url: form.target_url || null,
        target_dir: form.target_dir || null,
        persona_ids: form.persona_ids,
        journey_id: form.journey_id,
        model: form.model,
      });
      // Wait a moment for the run to be created, then get the run ID
      const runs = await getJobRuns(job.id);
      if (runs.length > 0) {
        return runs[runs.length - 1].id;
      }
      return job.id;
    },
    onSuccess: (runOrJobId) => {
      navigate(`/runs/${runOrJobId}`);
    },
  });

  const togglePersona = (id: string) => {
    setForm((prev) => ({
      ...prev,
      persona_ids: prev.persona_ids.includes(id)
        ? prev.persona_ids.filter((p) => p !== id)
        : [...prev.persona_ids, id],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  const isValid =
    form.name &&
    form.persona_ids.length > 0 &&
    form.journey_id &&
    (form.target_url || form.target_dir);

  return (
    <div className="page">
      <div className="page-header">
        <h2>New Run</h2>
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Job Name</label>
          <input
            id="name"
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g., Eval run for my-app v2.1"
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="target_dir">Target Directory</label>
            <input
              id="target_dir"
              type="text"
              value={form.target_dir}
              onChange={(e) => setForm((p) => ({ ...p, target_dir: e.target.value }))}
              placeholder="/path/to/project"
            />
          </div>
          <div className="form-group">
            <label htmlFor="target_url">Target URL</label>
            <input
              id="target_url"
              type="text"
              value={form.target_url}
              onChange={(e) => setForm((p) => ({ ...p, target_url: e.target.value }))}
              placeholder="https://my-app.example.com"
            />
          </div>
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
            value={form.model}
            onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label>Select Personas</label>
          <div className="persona-checkbox-grid">
            {personas?.map((p) => (
              <label key={p.id} className="checkbox-card">
                <input
                  type="checkbox"
                  checked={form.persona_ids.includes(p.id)}
                  onChange={() => togglePersona(p.id)}
                />
                <div className="checkbox-card-content">
                  <strong>{p.name}</strong>
                  <span className="checkbox-card-meta">{p.expertise_level}</span>
                </div>
              </label>
            ))}
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
          <p className="error">Failed to create job: {(createMutation.error as Error).message}</p>
        )}
      </form>
    </div>
  );
}
