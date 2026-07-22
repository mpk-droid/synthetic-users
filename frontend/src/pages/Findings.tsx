import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getGlobalFindings, updateGlobalFindingStatus } from '../api/client';
import SeverityBadge from '../components/SeverityBadge';

export default function Findings() {
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: findings, isLoading } = useQuery({
    queryKey: ['global-findings', severityFilter, statusFilter],
    queryFn: () =>
      getGlobalFindings({
        severity: severityFilter || undefined,
        status: statusFilter || undefined,
      }),
    refetchInterval: 10000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateGlobalFindingStatus(id, status),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['global-findings'] }),
  });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const repoGroups = (findings || []).reduce(
    (acc, f) => {
      if (!acc[f.repo_url]) acc[f.repo_url] = [];
      acc[f.repo_url].push(f);
      return acc;
    },
    {} as Record<string, NonNullable<typeof findings>>,
  );

  if (isLoading) return <p className="loading">Loading findings...</p>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Global Findings</h2>
      </div>

      <div className="form-row" style={{ marginBottom: '1rem' }}>
        <div className="form-group">
          <label htmlFor="severity-filter">Severity</label>
          <select
            id="severity-filter"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="fixed">Fixed</option>
          </select>
        </div>
      </div>

      {Object.keys(repoGroups).length === 0 && (
        <p className="empty-state">No findings yet. Run a job to generate findings.</p>
      )}

      {Object.entries(repoGroups).map(([repoUrl, repoFindings]) => (
        <section key={repoUrl} className="section">
          <div className="section-header">
            <h3>{repoUrl}</h3>
            <span className="badge">{repoFindings!.length} findings</span>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Category</th>
                <th>Title</th>
                <th>File</th>
                <th>Seen</th>
                <th>Personas</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {repoFindings!.map((f) => (
                <>
                  <tr
                    key={f.id}
                    onClick={() => toggleExpand(f.id)}
                    style={{ cursor: 'pointer' }}
                    className={expandedIds.has(f.id) ? 'row--expanded' : ''}
                  >
                    <td>
                      <SeverityBadge severity={f.severity} />
                    </td>
                    <td>{f.category}</td>
                    <td>{f.title}</td>
                    <td className="cell--mono">{f.file_path || '-'}</td>
                    <td>{f.seen_count}x</td>
                    <td>{f.persona_names.join(', ')}</td>
                    <td>
                      <select
                        value={f.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          statusMutation.mutate({
                            id: f.id,
                            status: e.target.value,
                          })
                        }
                        className={`status-select status-select--${f.status}`}
                      >
                        <option value="open">Open</option>
                        <option value="acknowledged">Acknowledged</option>
                        <option value="fixed">Fixed</option>
                      </select>
                    </td>
                  </tr>
                  {expandedIds.has(f.id) && (
                    <tr key={`${f.id}-detail`} className="row--detail">
                      <td colSpan={7}>
                        <div className="finding-detail">
                          <div>
                            <strong>Description:</strong>
                            <p>{f.description}</p>
                          </div>
                          <div>
                            <strong>Evidence:</strong>
                            <pre className="evidence-block">{f.evidence}</pre>
                          </div>
                          {f.suggestion && (
                            <div>
                              <strong>Suggestion:</strong>
                              <p>{f.suggestion}</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
