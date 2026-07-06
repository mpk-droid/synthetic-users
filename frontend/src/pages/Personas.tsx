import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getPersonas } from '../api/client';

export default function Personas() {
  const navigate = useNavigate();

  const { data: personas, isLoading, error } = useQuery({
    queryKey: ['personas'],
    queryFn: getPersonas,
  });

  return (
    <div className="page">
      <div className="page-header">
        <h2>Personas</h2>
        <button className="btn btn--primary" onClick={() => navigate('/personas/new')}>
          Create Persona
        </button>
      </div>

      {isLoading && <p className="loading">Loading personas...</p>}
      {error && <p className="error">Failed to load personas.</p>}

      <div className="card-grid">
        {personas?.map((p) => (
          <div
            key={p.id}
            className="card card--clickable"
            onClick={() => navigate(`/personas/${p.id}`)}
          >
            <div className="card-header">
              <h3 className="card-title">{p.name}</h3>
              <span
                className={`badge ${p.prompt_approved ? 'badge--green' : 'badge--gray'}`}
              >
                {p.prompt_approved ? 'Approved' : 'Unapproved'}
              </span>
            </div>
            <div className="card-meta">
              <span className="badge badge--outline">{p.expertise_level}</span>
            </div>
            <p className="card-snippet">{p.identity.slice(0, 120)}{p.identity.length > 120 ? '...' : ''}</p>
          </div>
        ))}
      </div>

      {personas?.length === 0 && !isLoading && (
        <p className="empty-state">No personas yet.</p>
      )}
    </div>
  );
}
