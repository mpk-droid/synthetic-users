import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import RunActions from '../components/RunActions';
import { IconExport } from '../components/NavIcons';
import { formatElapsed } from '../utils/datetime';
import { exportFindingsToCsv, sanitizeFilename } from '../utils/exportFindingsCsv';

type PhaseTimelineState = 'completed' | 'active' | 'pending' | 'error';

function isPhaseErrored(phase: JourneyPhaseRef, persona: RunPersonaDetail): boolean {
  if (persona.blocked_phase === phase.name) return true;
  const summary = persona.phase_summaries[phase.name];
  return typeof summary === 'string' && summary.startsWith('BLOCKED:');
}

const FINDING_SEVERITIES = ['critical', 'needs_attention', 'nits'] as const;

function stripScorePrefix(message: string): string {
  return message.replace(/^(GREEN|YELLOW|RED):\s*/i, '');
}

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

function PhaseTiming({
  state,
  times,
}: {
  state: PhaseTimelineState;
  times: PhaseTimes | undefined;
}) {
  const dash = '\u2014';
  const start = formatPhaseTime(times?.started_at);
  const end = state === 'active' ? dash : formatPhaseTime(times?.completed_at);
  const elapsed =
    state === 'pending'
      ? dash
      : formatElapsed(times?.started_at, times?.completed_at, state === 'active');

  return (
    <span className="phase-timeline-timing">
      (
      <span className="phase-timeline-timing__elapsed">elapsed: {elapsed}</span>
      {', start: '}
      {start}
      {', end: '}
      {end}
      )
    </span>
  );
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


function PhaseActivityStatus({
  isLive,
  phaseState,
}: {
  isLive: boolean;
  phaseState: PhaseTimelineState;
}) {
  if (isLive) {
    return (
      <span className="phase-activity-terminal__status phase-activity-terminal__status--tailing">
        tailing
      </span>
    );
  }
  if (phaseState === 'completed') {
    return (
      <span className="phase-activity-terminal__status phase-activity-terminal__status--completed">
        completed
      </span>
    );
  }
  if (phaseState === 'error') {
    return (
      <span className="phase-activity-terminal__status phase-activity-terminal__status--interrupted">
        interrupted
      </span>
    );
  }
  return null;
}

function PhaseActivityTerminal({
  phaseName,
  lines,
  isLive,
  phaseState,
  emptyMessage,
  height,
}: {
  phaseName: string;
  lines: string[];
  isLive: boolean;
  phaseState: PhaseTimelineState;
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
        <span className="phase-activity-terminal__title">
          Activity: <span className="phase-activity-terminal__title-phase">{phaseName}</span>
        </span>
        <PhaseActivityStatus isLive={isLive} phaseState={phaseState} />
      </div>
      <div
        className="phase-activity-terminal__body"
        ref={bodyRef}
        onScroll={handleScroll}
      >
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
  const progressBodyRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState<number>();
  const [connector, setConnector] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useLayoutEffect(() => {
    const el = leftColumnRef.current;
    if (!el) return;

    const syncLayout = () => {
      setPanelHeight(el.getBoundingClientRect().height);

      const body = progressBodyRef.current;
      const selected = selectedItemRef.current;
      const terminal = terminalRef.current;
      if (!body || !selected || !terminal) {
        setConnector(null);
        return;
      }

      const bodyRect = body.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();
      const terminalRect = terminal.getBoundingClientRect();
      const top = selectedRect.top + selectedRect.height / 2 - bodyRect.top;
      const left = selectedRect.right - bodyRect.left;
      const width = terminalRect.left - selectedRect.right;

      if (width <= 4) {
        setConnector(null);
        return;
      }

      setConnector({ top, left, width });
    };

    syncLayout();
    const observer = new ResizeObserver(syncLayout);
    observer.observe(el);
    if (progressBodyRef.current) observer.observe(progressBodyRef.current);
    if (terminalRef.current) observer.observe(terminalRef.current);
    window.addEventListener('resize', syncLayout);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncLayout);
    };
  }, [
    phases.length,
    persona.id,
    persona.status,
    persona.current_phase,
    selectedPhaseName,
  ]);

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
      <div className="run-progress-body" ref={progressBodyRef}>
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
                  ref={isSelected ? selectedItemRef : undefined}
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
                    <PhaseTiming
                      state={state}
                      times={persona.phase_times?.[phase.name]}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="run-progress-right" ref={terminalRef}>
          <PhaseActivityTerminal
            phaseName={selectedPhase?.name ?? 'Phase'}
            lines={terminalLines}
            isLive={terminalLive}
            phaseState={selectedState}
            height={panelHeight}
            emptyMessage={
              selectedState === 'pending'
                ? 'This phase has not started yet.'
                : 'Waiting for activity...'
            }
          />
        </div>
        {connector && (
          <span
            className="phase-activity-connector"
            style={{
              top: connector.top,
              left: connector.left,
              width: connector.width,
            }}
            aria-hidden="true"
          />
        )}
      </div>

    </div>
  );
}

type FindingRow = FindingResponse & { personaLabel?: string };

function FindingsSection({
  findings,
  findingsPending,
  emptyMessage,
  exportFilename,
  showPersonaColumn = false,
  personaOptions = [],
}: {
  findings: FindingRow[];
  findingsPending: boolean;
  emptyMessage: string;
  exportFilename: string;
  showPersonaColumn?: boolean;
  personaOptions?: string[];
}) {
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [severityFilter, setSeverityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [personaFilter, setPersonaFilter] = useState('');

  const categoryOptions = [...new Set(findings.map((f) => f.category))].sort();
  const phaseOptions = [...new Set(findings.map((f) => f.phase))].sort();
  const filteredFindings = [...findings]
    .filter((f) => {
      if (severityFilter && bucketSeverity(f.severity) !== severityFilter) {
        return false;
      }
      if (categoryFilter && f.category !== categoryFilter) return false;
      if (phaseFilter && f.phase !== phaseFilter) return false;
      if (personaFilter && f.personaLabel !== personaFilter) return false;
      return true;
    })
    .sort(compareFindings);
  const severityCounts = findings.reduce(
    (acc, f) => {
      const key = bucketSeverity(f.severity);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<(typeof FINDING_SEVERITIES)[number], number>,
  );

  const toggleFinding = (findingId: string) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(findingId)) next.delete(findingId);
      else next.add(findingId);
      return next;
    });
  };

  const columnCount = showPersonaColumn ? 5 : 4;

  return (
    <div className="findings-section">
      <div className="findings-section__header">
        <h4 className="findings-section__title">
          Findings
          <span className="findings-section__count">
            (
            {filteredFindings.length !== findings.length
              ? `${filteredFindings.length} of ${findings.length}`
              : findings.length}
            )
          </span>
        </h4>
        <div className="findings-section__stats">
          {FINDING_SEVERITIES.map((sev) => (
            <div key={sev} className="findings-stat">
              <SeverityBadge severity={sev} showColon />
              <span
                className={`findings-stat__count${findingsPending ? ' findings-stat__count--pending' : ''}`}
              >
                {findingsPending ? 'pending' : severityCounts[sev] || 0}
              </span>
            </div>
          ))}
          <button
            type="button"
            className="findings-export-btn"
            title="export to csv"
            aria-label="export to csv"
            disabled={filteredFindings.length === 0}
            onClick={() => exportFindingsToCsv(filteredFindings, exportFilename)}
          >
            <IconExport className="findings-export-btn__icon" />
          </button>
        </div>
      </div>
      {findings.length === 0 ? (
        <p className="empty-state">{emptyMessage}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <label className="data-table__th-filter">
                  <span className="data-table__th-label">Severity</span>
                  <select
                    aria-label="Filter by severity"
                    value={severityFilter}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    <option value="critical">Critical</option>
                    <option value="needs_attention">Needs attention</option>
                    <option value="nits">Nits</option>
                  </select>
                </label>
              </th>
              <th>
                <label className="data-table__th-filter">
                  <span className="data-table__th-label">Category</span>
                  <select
                    aria-label="Filter by category"
                    value={categoryFilter}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
              </th>
              <th>Title</th>
              {showPersonaColumn && (
                <th>
                  <label className="data-table__th-filter">
                    <span className="data-table__th-label">Persona</span>
                    <select
                      aria-label="Filter by persona"
                      value={personaFilter}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setPersonaFilter(e.target.value)}
                    >
                      <option value="">All</option>
                      {personaOptions.map((persona) => (
                        <option key={persona} value={persona}>
                          {persona}
                        </option>
                      ))}
                    </select>
                  </label>
                </th>
              )}
              <th>
                <label className="data-table__th-filter">
                  <span className="data-table__th-label">Phase</span>
                  <select
                    aria-label="Filter by phase"
                    value={phaseFilter}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setPhaseFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    {phaseOptions.map((phase) => (
                      <option key={phase} value={phase}>
                        {phase}
                      </option>
                    ))}
                  </select>
                </label>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredFindings.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="data-table__empty">
                  No findings match the current filters.
                </td>
              </tr>
            ) : (
              filteredFindings.map((f) => (
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
                    {showPersonaColumn && <td>{f.personaLabel}</td>}
                    <td>{f.phase}</td>
                  </tr>
                  {expandedFindings.has(f.id) && (
                    <tr className="finding-detail-row">
                      <td colSpan={columnCount}>
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
                              <strong>File:</strong> <code>{f.file_path}</code>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

type PersonaTab = 'overview' | number;


export default function RunDetail() {
  const navigate = useNavigate();
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

  const [activeTab, setActiveTab] = useState<PersonaTab>(0);

  if (isLoading) return <p className="loading">Loading run details...</p>;
  if (error) return <p className="error">Failed to load run details.</p>;
  if (!run) return null;

  const personaName = (personaId: string) =>
    allPersonas?.find((p) => p.id === personaId)?.name || personaId.slice(0, 8);

  const isOverview = activeTab === 'overview';
  const activePersona: RunPersonaDetail | undefined =
    typeof activeTab === 'number' ? run.personas[activeTab] : undefined;
  const isRunActive = run.status === 'pending' || run.status === 'running';
  const personaFindings = activePersona?.findings ?? [];
  const findingsPending =
    activePersona?.status === 'running' || activePersona?.status === 'pending';
  const overviewFindings: FindingRow[] = run.personas.flatMap((persona) => {
    const label = personaName(persona.persona_id);
    return (persona.findings ?? []).map((finding) => ({
      ...finding,
      personaLabel: label,
    }));
  });
  const overviewFindingsPending = run.personas.some(
    (persona) => persona.status === 'running' || persona.status === 'pending',
  );
  const overviewPersonaOptions = run.personas
    .map((persona) => personaName(persona.persona_id))
    .sort();

  return (
    <div className="page">
      <div className="run-header">
        <div className="run-header-top">
          <div className="run-header-badges">
            <ScoreBadge score={run.score} size="large" />
            <StatusBadge status={run.status} />
          </div>
          <RunActions
            runId={run.id}
            runName={run.name}
            status={run.status}
            variant="header"
            onDeleted={() => navigate('/')}
          />
        </div>
        {(run.error || run.score_rationale) && (
          <p className={`run-rationale${run.error ? ' run-rationale--error' : ''}`}>
            {stripScorePrefix(run.error ?? run.score_rationale ?? '')}
          </p>
        )}
        <div className="run-meta">
          {run.started_at && (
            <span
              className={`run-meta__elapsed${isRunActive ? ' run-meta__elapsed--active' : ''}`}
            >
              Elapsed: {formatElapsed(run.started_at, run.completed_at, isRunActive)}
            </span>
          )}
          {run.started_at && (
            <span>Started at: {new Date(run.started_at).toLocaleString()}</span>
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
            <button
              type="button"
              role="tab"
              aria-selected={isOverview}
              className={`persona-picker-item persona-picker-item--overview ${isOverview ? 'persona-picker-item--active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <span
                className="persona-picker-dot persona-picker-dot--overview"
                aria-hidden="true"
              />
              <span className="persona-picker-name">Overview</span>
            </button>
            {run.personas.map((p, idx) => {
              const name = personaName(p.persona_id);
              const isSelected = activeTab === idx;
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
                  onClick={() => setActiveTab(idx)}
                >
                  <span className={`persona-picker-dot ${dotClass}`} aria-hidden="true" />
                  <span className="persona-picker-name">{name}</span>
                </button>
              );
            })}
          </div>

          {isOverview ? (
            <div className="persona-detail persona-detail--overview">
              <section className="run-activity-section run-activity-section--overview">
                <PhaseActivityTerminal
                  phaseName="Overview"
                  lines={[]}
                  isLive={false}
                  phaseState="pending"
                  emptyMessage="TBD"
                />
              </section>
              <section className="run-findings-panel">
                <FindingsSection
                  findings={overviewFindings}
                  findingsPending={overviewFindingsPending}
                  emptyMessage={
                    overviewFindingsPending
                      ? 'Findings will appear here as personas complete their evaluation.'
                      : 'No findings for this run.'
                  }
                  exportFilename={`${sanitizeFilename(run.name)}-overview-findings.csv`}
                  showPersonaColumn
                  personaOptions={overviewPersonaOptions}
                />
              </section>
            </div>
          ) : (
            activePersona && (
            <div className="persona-detail">
              <section className="run-activity-section">
                {activePersona.blocked_phase && (
                  <div className="blocked-notice">
                    <strong>Blocked at phase:</strong> {activePersona.blocked_phase}
                    {activePersona.blocked_reason && (
                      <span> — {activePersona.blocked_reason}</span>
                    )}
                  </div>
                )}

                {run.journey_phases?.length > 0 && (
                  <PhaseProgress phases={run.journey_phases} persona={activePersona} />
                )}
              </section>

              <section className="run-findings-panel">
                <FindingsSection
                  findings={personaFindings}
                  findingsPending={findingsPending}
                  emptyMessage={
                    findingsPending
                      ? 'Findings will appear here when the run completes.'
                      : 'No findings for this persona.'
                  }
                  exportFilename={`${sanitizeFilename(run.name)}-${sanitizeFilename(personaName(activePersona.persona_id))}-findings.csv`}
                />
              </section>
            </div>
            )
          )}
        </section>
      )}

      {run.personas.length === 0 && (
        <p className="empty-state">No persona results yet.</p>
      )}
    </div>
  );
}
