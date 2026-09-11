import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getRunDetail, getPersonas } from '../api/client';
import type {
  JourneyPhaseRef,
  PhaseTimes,
  RunActivityEntry,
  RunPersonaDetail,
  FindingResponse,
} from '../types';
import ScoreBadge from '../components/ScoreBadge';
import StatusBadge from '../components/StatusBadge';
import SeverityBadge from '../components/SeverityBadge';

type PhaseTimelineState = 'completed' | 'active' | 'pending' | 'error';

function isPhaseErrored(phase: JourneyPhaseRef, persona: RunPersonaDetail): boolean {
  if (persona.blocked_phase === phase.name) return true;
  const summary = persona.phase_summaries[phase.name];
  return typeof summary === 'string' && summary.startsWith('BLOCKED:');
}

const FINDING_SEVERITIES = ['critical', 'needs_attention', 'nits'] as const;

function bucketSeverity(severity: string): (typeof FINDING_SEVERITIES)[number] {
  const key = severity.toLowerCase().replace(/-/g, '_').replace(/ /g, '_');
  if (key === 'critical') return 'critical';
  if (key === 'needs_attention' || key === 'high' || key === 'medium') {
    return 'needs_attention';
  }
  return 'nits';
}

const SEVERITY_ORDER: Record<(typeof FINDING_SEVERITIES)[number], number> = {
  critical: 0,
  needs_attention: 1,
  nits: 2,
};

function compareFindings(a: FindingResponse, b: FindingResponse): number {
  const bySeverity =
    SEVERITY_ORDER[bucketSeverity(a.severity)] -
    SEVERITY_ORDER[bucketSeverity(b.severity)];
  if (bySeverity !== 0) return bySeverity;
  return a.title.localeCompare(b.title);
}

function phaseState(
  phase: JourneyPhaseRef,
  persona: RunPersonaDetail,
): PhaseTimelineState {
  const { current_phase: currentPhase, phase_summaries: phaseSummaries, status } = persona;

  if (isPhaseErrored(phase, persona)) return 'error';

  if (phase.name in phaseSummaries) return 'completed';

  if (currentPhase === phase.name) {
    return status === 'running' ? 'active' : status === 'blocked' ? 'error' : 'pending';
  }

  return 'pending';
}

function connectorState(
  above: PhaseTimelineState,
  below: PhaseTimelineState,
): 'done' | 'active' | 'error' | 'pending' {
  if (above === 'error' || below === 'error') return 'error';
  if (above === 'completed' && (below === 'active' || below === 'completed')) return 'active';
  if (above === 'completed') return 'done';
  return 'pending';
}

function currentPhaseNumber(
  phases: JourneyPhaseRef[],
  persona: RunPersonaDetail,
): number {
  if (phases.length === 0) return 0;
  if (persona.blocked_phase) {
    const blockedIdx = phases.findIndex((p) => p.name === persona.blocked_phase);
    if (blockedIdx >= 0) return blockedIdx + 1;
  }
  if (persona.current_phase) {
    const idx = phases.findIndex((p) => p.name === persona.current_phase);
    if (idx >= 0) return idx + 1;
  }
  const completed = phases.filter(
    (p) => p.name in persona.phase_summaries && !isPhaseErrored(p, persona),
  ).length;
  if (completed >= phases.length) return phases.length;
  return Math.max(completed, 1);
}

function formatPhaseTime(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatElapsed(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
  isActive: boolean,
): string {
  const dash = '\u2014';
  if (!startedAt) return dash;
  const start = new Date(startedAt).getTime();
  const end = completedAt
    ? new Date(completedAt).getTime()
    : isActive
      ? Date.now()
      : Number.NaN;
  if (Number.isNaN(end)) return dash;
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  if (minutes < 1) return '<1m';
  return `${minutes}m`;
}


function defaultSelectedPhase(
  phases: JourneyPhaseRef[],
  persona: RunPersonaDetail,
): string {
  if (persona.current_phase && phases.some((p) => p.name === persona.current_phase)) {
    return persona.current_phase;
  }
  const completed = phases.filter((p) => p.name in persona.phase_summaries);
  if (completed.length > 0) return completed[completed.length - 1].name;
  return phases[0]?.name ?? '';
}

function partitionActivityByPhase(
  activity: RunActivityEntry[],
  phases: JourneyPhaseRef[],
): Record<string, RunActivityEntry[]> {
  const result: Record<string, RunActivityEntry[]> = {};
  for (const phase of phases) {
    result[phase.name] = [];
  }

  let currentPhase: string | null = null;
  for (const entry of activity) {
    const started = entry.message.match(/^Started phase: (.+)$/);
    if (entry.type === 'phase' && started) {
      currentPhase = started[1];
      continue;
    }

    const target =
      currentPhase && result[currentPhase] ? currentPhase : phases[0]?.name;
    if (target) {
      result[target].push(entry);
    }
  }

  return result;
}

function activityLogLine(entry: RunActivityEntry): string | null {
  if (entry.type === 'phase' && entry.message.startsWith('Started phase:')) {
    return null;
  }
  const time = new Date(entry.at).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${time}  ${entry.message}`;
}

function phaseTimingText(
  state: PhaseTimelineState,
  times: PhaseTimes | undefined,
): string {
  const dash = '\u2014';
  const start = formatPhaseTime(times?.started_at);
  const end = state === 'active' ? dash : formatPhaseTime(times?.completed_at);
  const elapsed =
    state === 'pending'
      ? dash
      : formatElapsed(times?.started_at, times?.completed_at, state === 'active');
  if (state === 'pending') {
    return `(start: ${dash}, end: ${dash}, elapsed: ${dash})`;
  }
  return `(start: ${start}, end: ${end}, elapsed: ${elapsed})`;
}

function PhaseTimelineDot({ state }: { state: PhaseTimelineState }) {
  if (state === 'completed') {
    return (
      <span className="phase-timeline-dot phase-timeline-dot--completed" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
          <path
            d="M3.5 8.2 6.4 11 12.5 5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (state === 'active') {
    return <span className="phase-timeline-dot phase-timeline-dot--active" aria-hidden="true" />;
  }
  if (state === 'error') {
    return (
      <span className="phase-timeline-dot phase-timeline-dot--error" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
          <path
            d="M4.5 4.5l7 7M11.5 4.5l-7 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }
  return <span className="phase-timeline-dot phase-timeline-dot--pending" aria-hidden="true" />;
}


function PhaseActivityTerminal({
  phaseName,
  lines,
  isLive,
  emptyMessage,
  height,
}: {
  phaseName: string;
  lines: string[];
  isLive: boolean;
  emptyMessage: string;
  height?: number;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const scrollToBottom = () => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    stickToBottomRef.current = true;
    requestAnimationFrame(scrollToBottom);
  }, [phaseName]);

  useEffect(() => {
    if (isLive) {
      stickToBottomRef.current = true;
    }
  }, [isLive]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    requestAnimationFrame(scrollToBottom);
  }, [lines]);

  const handleScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 48;
  };

  return (
    <div
      className="phase-activity-terminal"
      style={height ? { height } : undefined}
      aria-label={`Activity log for ${phaseName}`}
    >
      <div className="phase-activity-terminal__chrome">
        <span className="phase-activity-terminal__title">Activity</span>
        {isLive && <span className="phase-activity-terminal__live">tailing</span>}
      </div>
      <div
        className="phase-activity-terminal__body"
        ref={bodyRef}
        onScroll={handleScroll}
      >
        <div className="phase-activity-terminal__phase">{phaseName}:</div>
        {lines.length === 0 ? (
          <p className="phase-activity-terminal__empty">{emptyMessage}</p>
        ) : (
          <ul className="phase-activity-terminal__list">
            {lines.map((line, index) => (
              <li key={`${index}-${line.slice(0, 40)}`}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PhaseProgress({
  phases,
  persona,
}: {
  phases: JourneyPhaseRef[];
  persona: RunPersonaDetail;
}) {
  const [selectedPhaseName, setSelectedPhaseName] = useState(() =>
    defaultSelectedPhase(phases, persona),
  );
  const [userPickedPhase, setUserPickedPhase] = useState(false);
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState<number>();

  useLayoutEffect(() => {
    const el = leftColumnRef.current;
    if (!el) return;

    const syncHeight = () => {
      setPanelHeight(el.getBoundingClientRect().height);
    };

    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(el);
    window.addEventListener('resize', syncHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncHeight);
    };
  }, [phases.length, persona.id, persona.status, persona.current_phase]);

  useEffect(() => {
    setUserPickedPhase(false);
    setSelectedPhaseName(defaultSelectedPhase(phases, persona));
  }, [persona.id, phases]);

  useEffect(() => {
    if (!userPickedPhase && persona.current_phase) {
      setSelectedPhaseName(persona.current_phase);
    }
  }, [persona.current_phase, userPickedPhase]);

  if (phases.length === 0) return null;

  const states = phases.map((phase) => phaseState(phase, persona));
  const phaseNum = currentPhaseNumber(phases, persona);
  const isLive = persona.status === 'running';
  const isErrored = persona.status === 'blocked';
  const activityByPhase = partitionActivityByPhase(persona.activity ?? [], phases);
  const selectedPhase =
    phases.find((phase) => phase.name === selectedPhaseName) ?? phases[0];
  const selectedState = selectedPhase
    ? phaseState(selectedPhase, persona)
    : 'pending';
  const terminalLines = (activityByPhase[selectedPhase?.name ?? ''] ?? [])
    .map(activityLogLine)
    .filter((line): line is string => line !== null);
  const terminalLive =
    isLive && persona.current_phase === selectedPhase?.name && !isErrored;

  return (
    <div className="run-progress">
      <div className="run-progress-body">
        <div className="run-progress-left" ref={leftColumnRef}>
          <div className="run-progress-header">
            <span className="run-progress-label">
              {isLive && persona.current_phase
                ? `Phase ${phaseNum} of ${phases.length}: ${persona.current_phase}`
                : isErrored && persona.blocked_phase
                  ? `Stopped at phase ${phaseNum} of ${phases.length}: ${persona.blocked_phase}`
                  : persona.status === 'completed'
                    ? `Completed all ${phases.length} phases`
                    : `Phase progress (${phaseNum} of ${phases.length})`}
            </span>
          </div>

          <div className="phase-timeline" role="list" aria-label="Journey phases">
            {phases.map((phase, index) => {
              const state = states[index];
              const lineState =
                index < phases.length - 1
                  ? connectorState(state, states[index + 1])
                  : null;
              const isSelected = phase.name === selectedPhase?.name;

              return (
                <button
                  key={phase.order}
                  type="button"
                  className={`phase-timeline-item phase-timeline-item--${state}${
                    isSelected ? ' phase-timeline-item--selected' : ''
                  }`}
                  role="listitem"
                  aria-current={state === 'active' ? 'step' : undefined}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedPhaseName(phase.name);
                    setUserPickedPhase(true);
                  }}
                >
                  <div className="phase-timeline-rail">
                    <PhaseTimelineDot state={state} />
                    {lineState && (
                      <span
                        className={`phase-timeline-line phase-timeline-line--${lineState}`}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <span className="phase-timeline-content">
                    <span className="phase-timeline-name">{phase.name}</span>
                    <span className="phase-timeline-timing">
                      {phaseTimingText(state, persona.phase_times?.[phase.name])}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <PhaseActivityTerminal
          phaseName={selectedPhase?.name ?? 'Phase'}
          lines={terminalLines}
          isLive={terminalLive}
          height={panelHeight}
          emptyMessage={
            selectedState === 'pending'
              ? 'This phase has not started yet.'
              : 'Waiting for activity...'
          }
        />
      </div>

      {isErrored && persona.blocked_reason && (
        <p className="run-progress-meta run-progress-meta--error">{persona.blocked_reason}</p>
      )}
    </div>
  );
}

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: run, isLoading, error } = useQuery({
    queryKey: ['run', id],
    queryFn: () => getRunDetail(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'pending' || status === 'running') return 3000;
      return false;
    },
  });

  const { data: allPersonas } = useQuery({
    queryKey: ['personas'],
    queryFn: getPersonas,
  });

  const [activePersonaIdx, setActivePersonaIdx] = useState(0);
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [severityFilter, setSeverityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');

  useEffect(() => {
    setSeverityFilter('');
    setCategoryFilter('');
    setPhaseFilter('');
  }, [activePersonaIdx]);

  const toggleFinding = (findingId: string) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(findingId)) next.delete(findingId);
      else next.add(findingId);
      return next;
    });
  };

  if (isLoading) return <p className="loading">Loading run details...</p>;
  if (error) return <p className="error">Failed to load run details.</p>;
  if (!run) return null;

  const personaName = (personaId: string) =>
    allPersonas?.find((p) => p.id === personaId)?.name || personaId.slice(0, 8);

  const activePersona: RunPersonaDetail | undefined = run.personas[activePersonaIdx];
  const isRunActive = run.status === 'pending' || run.status === 'running';
  const findingsPending =
    activePersona?.status === 'running' || activePersona?.status === 'pending';

  const personaFindings = activePersona?.findings ?? [];
  const categoryOptions = [...new Set(personaFindings.map((f) => f.category))].sort();
  const phaseOptions = [...new Set(personaFindings.map((f) => f.phase))].sort();
  const filteredFindings = [...personaFindings]
    .filter((f) => {
      if (severityFilter && bucketSeverity(f.severity) !== severityFilter) {
        return false;
      }
      if (categoryFilter && f.category !== categoryFilter) return false;
      if (phaseFilter && f.phase !== phaseFilter) return false;
      return true;
    })
    .sort(compareFindings);
  const severityCounts = personaFindings.reduce(
    (acc, f) => {
      const key = bucketSeverity(f.severity);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<(typeof FINDING_SEVERITIES)[number], number>,
  );

  return (
    <div className="page">
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
          {isRunActive && (
            <span className="run-live-hint">Auto-refreshing every 3s</span>
          )}
        </div>
      </div>

      {run.personas.length > 0 && (
        <section className="section persona-progress-panel">
          <div className="persona-picker" role="tablist" aria-label="Personas">
            {run.personas.map((p, idx) => {
              const name = personaName(p.persona_id);
              const isSelected = idx === activePersonaIdx;
              const dotClass =
                p.status === 'running'
                  ? 'persona-picker-dot--live'
                  : p.status === 'blocked'
                    ? 'persona-picker-dot--error'
                    : p.status === 'completed'
                      ? 'persona-picker-dot--done'
                      : 'persona-picker-dot--idle';
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`persona-picker-item ${isSelected ? 'persona-picker-item--active' : ''}`}
                  onClick={() => setActivePersonaIdx(idx)}
                >
                  <span className={`persona-picker-dot ${dotClass}`} aria-hidden="true" />
                  <span className="persona-picker-name">{name}</span>
                </button>
              );
            })}
          </div>

          {activePersona && (
            <div className="persona-detail">
              {run.journey_phases?.length > 0 && (
                <PhaseProgress phases={run.journey_phases} persona={activePersona} />
              )}

              {activePersona.blocked_phase && (
                <div className="blocked-notice">
                  <strong>Blocked at phase:</strong> {activePersona.blocked_phase}
                  {activePersona.blocked_reason && (
                    <span> — {activePersona.blocked_reason}</span>
                  )}
                </div>
              )}

              <div className="findings-summary-section">
                <h4>Findings Summary</h4>
                <div className="summary-grid">
                  {FINDING_SEVERITIES.map((sev) => (
                    <div key={sev} className="summary-card">
                      <span className={`summary-count${findingsPending ? ' summary-count--pending' : ''}`}>
                        {findingsPending ? 'pending' : severityCounts[sev] || 0}
                      </span>
                      <SeverityBadge severity={sev} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="findings-section">
                <h4>
                  Findings ({filteredFindings.length}
                  {filteredFindings.length !== personaFindings.length
                    ? ` of ${personaFindings.length}`
                    : ''}
                  )
                </h4>
                {personaFindings.length === 0 ? (
                  <p className="empty-state">
                    {findingsPending
                      ? 'Findings will appear here when the run completes.'
                      : 'No findings for this persona.'}
                  </p>
                ) : (
                  <>
                    <div className="findings-filters form-row">
                      <div className="form-group">
                        <label htmlFor="run-severity-filter">Severity</label>
                        <select
                          id="run-severity-filter"
                          value={severityFilter}
                          onChange={(e) => setSeverityFilter(e.target.value)}
                        >
                          <option value="">All</option>
                          <option value="critical">Critical</option>
                          <option value="needs_attention">Needs attention</option>
                          <option value="nits">Nits</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="run-category-filter">Category</label>
                        <select
                          id="run-category-filter"
                          value={categoryFilter}
                          onChange={(e) => setCategoryFilter(e.target.value)}
                        >
                          <option value="">All</option>
                          {categoryOptions.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="run-phase-filter">Phase</label>
                        <select
                          id="run-phase-filter"
                          value={phaseFilter}
                          onChange={(e) => setPhaseFilter(e.target.value)}
                        >
                          <option value="">All</option>
                          {phaseOptions.map((phase) => (
                            <option key={phase} value={phase}>
                              {phase}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {filteredFindings.length === 0 ? (
                      <p className="empty-state">No findings match the current filters.</p>
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
                          {filteredFindings.map((f: FindingResponse) => (
                            <Fragment key={f.id}>
                              <tr
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
                                  <span
                                    className={`badge ${f.verified ? 'badge--green' : 'badge--gray'}`}
                                  >
                                    {f.verified ? 'Yes' : 'No'}
                                  </span>
                                </td>
                              </tr>
                              {expandedFindings.has(f.id) && (
                                <tr className="finding-detail-row">
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
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
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
