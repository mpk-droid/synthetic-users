import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { deleteRun, getRuns } from '../api/client';
import ScoreBadge from '../components/ScoreBadge';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const runsQuery = useQuery({
    queryKey: ['runs'],
    queryFn: getRuns,
    refetchInterval: 10000,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });

  const runs = runsQuery.data ?? [];

  const handleDelete = (runId: string, runName: string) => {
    if (
      window.confirm(
        `Delete run "${runName}"? This permanently removes the run and its findings.`,
      )
    ) {
      deleteMutation.mutate(runId);
    }
  };

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
      {deleteMutation.error && (
        <p className="error">Failed to delete run: {(deleteMutation.error as Error).message}</p>
      )}

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
              <th>Date</th>
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
                <td>{new Date(run.created_at).toLocaleDateString()}</td>
                <td className="data-table__actions">
                  <button
                    type="button"
                    className="btn btn--icon btn--danger-text data-table__delete"
                    title={`Delete ${run.name}`}
                    aria-label={`Delete ${run.name}`}
                    disabled={deleteMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(run.id, run.name);
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
