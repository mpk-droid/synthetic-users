import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJourneys, getRuns } from '../api/client';
import RunActions from '../components/RunActions';
import ScoreBadge from '../components/ScoreBadge';
import StatusBadge from '../components/StatusBadge';
import { formatElapsed, formatRunDateTime } from '../utils/datetime';

function shortJourneyName(name: string): string {
  return name.replace(/\s+journey$/i, '');
}

export default function Dashboard() {
  const navigate = useNavigate();

  const runsQuery = useQuery({
    queryKey: ['runs'],
    queryFn: getRuns,
    refetchInterval: 10000,
  });

  const journeysQuery = useQuery({
    queryKey: ['journeys'],
    queryFn: getJourneys,
  });

  const journeyNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const journey of journeysQuery.data ?? []) {
      map.set(journey.id, shortJourneyName(journey.name));
    }
    return map;
  }, [journeysQuery.data]);

  const runs = runsQuery.data ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <h2>Dashboard</h2>
        <button className="btn btn--primary" onClick={() => navigate('/runs/new')}>
          New Run
        </button>
      </div>

      {runsQuery.isLoading && <p className="loading">Loading runs...</p>}
      {runsQuery.error && <p className="error">Failed to load runs.</p>}

      {runs.length === 0 && !runsQuery.isLoading && (
        <p className="empty-state">No runs yet. Create one to get started.</p>
      )}

      {runs.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Run Name</th>
              <th>Score</th>
              <th>Status</th>
              <th>Personas</th>
              <th>Journey</th>
              <th>Started at</th>
              <th>Elapsed</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr
                key={run.id}
                className="data-table__row--clickable"
                onClick={() => navigate(`/runs/${run.id}`)}
              >
                <td>{run.name}</td>
                <td>
                  <ScoreBadge score={run.score} />
                </td>
                <td>
                  <StatusBadge status={run.status} />
                </td>
                <td>{run.persona_environments.length}</td>
                <td>{journeyNameById.get(run.journey_id) ?? '—'}</td>
                <td>{formatRunDateTime(run.started_at ?? run.created_at)}</td>
                <td>
                  {formatElapsed(
                    run.started_at,
                    run.completed_at,
                    run.status === 'pending' || run.status === 'running',
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <RunActions runId={run.id} runName={run.name} status={run.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
