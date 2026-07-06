import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getRunDetail, getPersonas } from '../api/client';
import type { RunPersonaDetail, FindingResponse } from '../types';
import ScoreBadge from '../components/ScoreBadge';
import StatusBadge from '../components/StatusBadge';
import SeverityBadge from '../components/SeverityBadge';

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: run, isLoading, error } = useQuery({
    queryKey: ['run', id],
    queryFn: () => getRunDetail(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'pending' || status === 'running') return 5000;
      return false;
    },
  });

  const { data: allPersonas } = useQuery({
    queryKey: ['personas'],
    queryFn: getPersonas,
  });

  const [activePersonaIdx, setActivePersonaIdx] = useState(0);
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  const toggleFinding = (findingId: string) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(findingId)) next.delete(findingId);
      else next.add(findingId);
      return next;
    });
  };

  const togglePhase = (key: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading) return <p className="loading">Loading run details...</p>;
  if (error) return <p className="error">Failed to load run details.</p>;
  if (!run) return null;

  const personaName = (personaId: string) =>
    allPersonas?.find((p) => p.id === personaId)?.name || personaId.slice(0, 8);

  const allFindings = run.personas.flatMap((p) => p.findings);
  const severityCounts = allFindings.reduce(
    (acc, f) => {
      const key = f.severity.toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const activePersona: RunPersonaDetail | undefined = run.personas[activePersonaIdx];

  return (
    <div className="page">
      {/* Header */}
      <div className="run-header">
        <div className="run-header-top">
          <ScoreBadge score={run.score} size="large" />
          <StatusBadge status={run.status} />
        </div>
        {run.score_rationale && (
          <p className="run-rationale">{run.score_rationale}</p>
        )}
        {run.error && (
          <p className="error">{run.error}</p>
        )}
        <div className="run-meta">
          {run.started_at && (
            <span>Started: {new Date(run.started_at).toLocaleString()}</span>
          )}
          {run.completed_at && (
            <span>Completed: {new Date(run.completed_at).toLocaleString()}</span>
          )}
        </div>
      </div>

      {/* Summary */}
      <section className="section">
        <h3>Findings Summary</h3>
        <div className="summary-grid">
          {['critical', 'high', 'medium', 'low', 'info'].map((sev) => (
            <div key={sev} className="summary-card">
              <span className="summary-count">{severityCounts[sev] || 0}</span>
              <SeverityBadge severity={sev} />
            </div>
          ))}
          <div className="summary-card">
            <span className="summary-count">{allFindings.length}</span>
            <span className="summary-label">Total</span>
          </div>
        </div>
      </section>

      {/* Persona tabs */}
      {run.personas.length > 0 && (
        <section className="section">
          <h3>Personas</h3>
          <div className="tab-bar">
            {run.personas.map((p, idx) => (
              <button
                key={p.id}
                className={`tab ${idx === activePersonaIdx ? 'tab--active' : ''}`}
                onClick={() => setActivePersonaIdx(idx)}
              >
                {personaName(p.persona_id)}
                <StatusBadge status={p.status} />
              </button>
            ))}
          </div>

          {activePersona && (
            <div className="persona-detail">
              {activePersona.blocked_phase && (
                <div className="blocked-notice">
                  <strong>Blocked at phase:</strong> {activePersona.blocked_phase}
                  {activePersona.blocked_reason && (
                    <span> — {activePersona.blocked_reason}</span>
                  )}
                </div>
              )}

              {/* Phase summaries */}
              {Object.keys(activePersona.phase_summaries).length > 0 && (
                <div className="phase-summaries">
                  <h4>Phase Summaries</h4>
                  {Object.entries(activePersona.phase_summaries).map(([phase, summary]) => (
                    <div key={phase} className="phase-summary-item">
                      <button
                        className="phase-summary-toggle"
                        onClick={() => togglePhase(`${activePersona.id}-${phase}`)}
                      >
                        <span className="phase-summary-name">{phase}</span>
                        <span>
                          {expandedPhases.has(`${activePersona.id}-${phase}`) ? '−' : '+'}
                        </span>
                      </button>
                      {expandedPhases.has(`${activePersona.id}-${phase}`) && (
                        <p className="phase-summary-text">{summary}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Findings */}
              <div className="findings-section">
                <h4>Findings ({activePersona.findings.length})</h4>
                {activePersona.findings.length === 0 ? (
                  <p className="empty-state">No findings for this persona.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Severity</th>
                        <th>Category</th>
                        <th>Title</th>
                        <th>Phase</th>
                        <th>Verified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePersona.findings.map((f: FindingResponse) => (
                        <>
                          <tr
                            key={f.id}
                            className="data-table__row--clickable"
                            onClick={() => toggleFinding(f.id)}
                          >
                            <td>
                              <SeverityBadge severity={f.severity} />
                            </td>
                            <td>{f.category}</td>
                            <td>{f.title}</td>
                            <td>{f.phase}</td>
                            <td>
                              <span className={`badge ${f.verified ? 'badge--green' : 'badge--gray'}`}>
                                {f.verified ? 'Yes' : 'No'}
                              </span>
                            </td>
                          </tr>
                          {expandedFindings.has(f.id) && (
                            <tr key={`${f.id}-detail`} className="finding-detail-row">
                              <td colSpan={5}>
                                <div className="finding-detail">
                                  <div className="finding-description">
                                    <strong>Description</strong>
                                    <p>{f.description}</p>
                                  </div>
                                  <div className="finding-evidence">
                                    <strong>Evidence</strong>
                                    <blockquote>{f.evidence}</blockquote>
                                  </div>
                                  {f.suggestion && (
                                    <div className="finding-suggestion">
                                      <strong>Suggestion</strong>
                                      <p>{f.suggestion}</p>
                                    </div>
                                  )}
                                  {f.file_path && (
                                    <div className="finding-file">
                                      <strong>File:</strong>{' '}
                                      <code>{f.file_path}</code>
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
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {run.personas.length === 0 && (
        <p className="empty-state">No persona results yet.</p>
      )}
    </div>
  );
}
