import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJourneys } from '../api/client';

export default function Journeys() {
  const navigate = useNavigate();

  const { data: journeys, isLoading, error } = useQuery({
    queryKey: ['journeys'],
    queryFn: getJourneys,
  });

  return (
    <div className="page">
      <div className="page-header">
        <h2>Journeys</h2>
      </div>

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
        <p className="empty-state">No journeys yet.</p>
      )}
    </div>
  );
}
