import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJobs, getJobRuns } from '../api/client';
import type { RunResponse } from '../types';
import ScoreBadge from '../components/ScoreBadge';
import StatusBadge from '../components/StatusBadge';

interface DashboardRow {
  jobId: string;
  jobName: string;
  run: RunResponse | null;
  personaCount: number;
  createdAt: string;
}

export default function Dashboard() {
  const navigate = useNavigate();

  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: getJobs,
  });

  const runsQuery = useQuery({
    queryKey: ['dashboard-runs'],
    queryFn: async () => {
      const jobs = await getJobs();
      const rows: DashboardRow[] = [];
      for (const job of jobs) {
        try {
          const runs = await getJobRuns(job.id);
          const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;
          rows.push({
            jobId: job.id,
            jobName: job.name,
            run: latestRun,
            personaCount: job.persona_environments.length,
            createdAt: job.created_at,
          });
        } catch {
          rows.push({
            jobId: job.id,
            jobName: job.name,
            run: null,
            personaCount: job.persona_environments.length,
            createdAt: job.created_at,
          });
        }
      }
      return rows;
    },
    refetchInterval: 10000,
  });

  const rows = runsQuery.data ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <h2>Dashboard</h2>
        <button className="btn btn--primary" onClick={() => navigate('/runs/new')}>
          New Run
        </button>
      </div>

      {jobsQuery.isLoading && <p className="loading">Loading jobs...</p>}
      {jobsQuery.error && <p className="error">Failed to load jobs.</p>}

      {rows.length === 0 && !jobsQuery.isLoading && (
        <p className="empty-state">No runs yet. Create one to get started.</p>
      )}

      {rows.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Job Name</th>
              <th>Score</th>
              <th>Status</th>
              <th>Personas</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.jobId}
                className="data-table__row--clickable"
                onClick={() => {
                  if (row.run) navigate(`/runs/${row.run.id}`);
                }}
              >
                <td>{row.jobName}</td>
                <td>
                  <ScoreBadge score={row.run?.score ?? null} />
                </td>
                <td>
                  <StatusBadge status={row.run?.status ?? 'pending'} />
                </td>
                <td>{row.personaCount}</td>
                <td>{new Date(row.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
