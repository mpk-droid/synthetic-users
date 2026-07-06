import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPersona, generatePrompt } from '../api/client';

export default function PersonaCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: '',
    identity: '',
    perspective: '',
    constraints: '',
    expertise_level: 'intermediate',
  });

  const [previewPrompt, setPreviewPrompt] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createPersona(form),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['personas'] });
      navigate(`/personas/${data.id}`);
    },
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      generatePrompt({
        identity: form.identity,
        perspective: form.perspective,
        constraints: form.constraints,
        expertise_level: form.expertise_level,
      }),
    onSuccess: (data) => {
      setPreviewPrompt(data.system_prompt);
    },
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Create Persona</h2>
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g., Senior DevOps Engineer"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="identity">Identity</label>
          <textarea
            id="identity"
            name="identity"
            rows={4}
            value={form.identity}
            onChange={handleChange}
            placeholder="Who is this persona? Background, role, experience..."
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="perspective">Perspective</label>
          <textarea
            id="perspective"
            name="perspective"
            rows={4}
            value={form.perspective}
            onChange={handleChange}
            placeholder="How does this persona approach problems? What do they care about?"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="constraints">Constraints</label>
          <textarea
            id="constraints"
            name="constraints"
            rows={4}
            value={form.constraints}
            onChange={handleChange}
            placeholder="Limitations, things this persona would not do or know..."
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="expertise_level">Expertise Level</label>
          <select
            id="expertise_level"
            name="expertise_level"
            value={form.expertise_level}
            onChange={handleChange}
          >
            <option value="novice">Novice</option>
            <option value="intermediate">Intermediate</option>
            <option value="expert">Expert</option>
          </select>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Persona'}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending || !form.identity}
          >
            {previewMutation.isPending ? 'Generating...' : 'Preview Prompt'}
          </button>
        </div>
        {createMutation.isError && (
          <p className="error">Failed to create persona.</p>
        )}
      </form>

      {previewPrompt && (
        <section className="section">
          <h3>Prompt Preview</h3>
          <pre className="prompt-display">{previewPrompt}</pre>
        </section>
      )}
    </div>
  );
}
