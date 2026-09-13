import { useQuery } from '@tanstack/react-query';
import { getEnvironments } from '../api/client';
import { WorkInProgressBanner } from '../components/WorkInProgressBanner';

export default function Environments() {
  const { data: environments, isLoading } = useQuery({
    queryKey: ['environments'],
    queryFn: getEnvironments,
  });

  if (isLoading) return <p className="loading">Loading environments...</p>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>
          Environments <span className="badge badge--wip">Work in progress</span>
        </h2>
      </div>

      <WorkInProgressBanner>
        Custom agent environments are not ready yet. Create, update, and delete are
        disabled. Runs use the default agent image until this ships.
      </WorkInProgressBanner>

      {environments && environments.length > 0 && (
        <div className="card-grid" style={{ marginTop: '16px' }}>
          {environments.map((env) => (
            <div key={env.id} className="card" style={{ padding: '20px' }}>
              <h3>{env.name}</h3>
              <code style={{ fontSize: '13px', color: '#888' }}>{env.image}</code>
              {env.description && (
                <p style={{ fontSize: '14px', color: '#aaa', marginTop: '8px' }}>
                  {env.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
