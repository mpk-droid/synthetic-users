import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPersona,
  updatePersona,
  deletePersona,
  generatePersonaPrompt,
  approvePersonaPrompt,
} from '../api/client';

export default function PersonaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: persona, isLoading, error } = useQuery({
    queryKey: ['persona', id],
    queryFn: () => getPersona(id!),
    enabled: !!id,
  });

  const [form, setForm] = useState({
    name: '',
    identity: '',
    perspective: '',
    constraints: '',
    expertise_level: 'intermediate',
  });

  useEffect(() => {
    if (persona) {
      setForm({
        name: persona.name,
        identity: persona.identity,
        perspective: persona.perspective,
        constraints: persona.constraints,
        expertise_level: persona.expertise_level,
      });
    }
  }, [persona]);

  const updateMutation = useMutation({
    mutationFn: () => updatePersona(id!, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persona', id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePersona(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas'] });
      navigate('/personas');
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => generatePersonaPrompt(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persona', id] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => approvePersonaPrompt(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persona', id] });
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this persona?')) {
      deleteMutation.mutate();
    }
  };

  if (isLoading) return <p className="loading">Loading persona...</p>;
  if (error) return <p className="error">Failed to load persona.</p>;
  if (!persona) return null;

  return (
    <div className="page">
      <div className="page-header">
        <h2>{persona.name}</h2>
        <div className="page-header-actions">
          <span
            className={`badge ${persona.prompt_approved ? 'badge--green' : 'badge--gray'}`}
          >
            {persona.prompt_approved ? 'Prompt Approved' : 'Prompt Unapproved'}
          </span>
        </div>
      </div>

      <form className="form" onSubmit={handleSave}>
        <div className="form-group">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
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
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            Delete
          </button>
        </div>
        {updateMutation.isSuccess && (
          <p className="form-success">Saved successfully.</p>
        )}
        {updateMutation.isError && (
          <p className="error">Failed to save changes.</p>
        )}
      </form>

      <section className="section">
        <h3>System Prompt</h3>
        <div className="prompt-actions">
          <button
            className="btn btn--secondary"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? 'Generating...' : 'Regenerate Prompt'}
          </button>
          <button
            className="btn btn--primary"
            onClick={() => approveMutation.mutate()}
            disabled={
              approveMutation.isPending ||
              !persona.system_prompt ||
              persona.prompt_approved
            }
          >
            {approveMutation.isPending ? 'Approving...' : 'Approve Prompt'}
          </button>
        </div>
        {persona.system_prompt ? (
          <pre className="prompt-display">{persona.system_prompt}</pre>
        ) : (
          <p className="empty-state">
            No system prompt generated yet. Click "Regenerate Prompt" to create one.
          </p>
        )}
      </section>
    </div>
  );
}
