import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getJourneys, getRunDetail, getPersonas } from '../api/client';
import type {
  JourneyPhaseRef,
  PhaseTimes,
  RunActivityEntry,
  RunPersonaDetail,
  FindingResponse,
  RunInsight,
  RunTriage,
  TriagedFinding,
  VerificationStatus,
} from '../types';
import ScoreBadge from '../components/ScoreBadge';
import StatusBadge from '../components/StatusBadge';
import SeverityBadge from '../components/SeverityBadge';
import RunActions from '../components/RunActions';
import { IconExport } from '../components/NavIcons';
import { formatElapsed } from '../utils/datetime';
import { personaDisplayLabel, personaShortName } from '../utils/personaDisplay';
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
  journeyName,
}: {
  phases: JourneyPhaseRef[];
  persona: RunPersonaDetail;
  journeyName?: string;
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
                    ? `Completed all ${phases.length} phases${journeyName ? `: ${journeyName}` : ''}`
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



function verificationLabel(status: VerificationStatus): string {
  switch (status) {
    case 'verified':
      return 'Verified';
    case 'consensus_only':
      return 'Consensus only';
    case 'unverified':
      return 'Unverified';
    default:
      return status;
  }
}

function isJourneyInsight(insight: RunInsight): boolean {
  return insight.scope === 'journey';
}

type PersonaInsightGroup = {
  id: string;
  label: string;
  matchKeys: string[];
};

function buildPersonaInsightGroups(
  runPersonas: RunPersonaDetail[],
  allPersonas: { id: string; name: string; role_label: string }[] | undefined,
  personaName: (personaId: string) => string,
): PersonaInsightGroup[] {
  return runPersonas.map((runPersona) => {
    const catalog = allPersonas?.find((persona) => persona.id === runPersona.persona_id);
    const name = personaName(runPersona.persona_id);
    const label = personaDisplayLabel(name, catalog?.role_label);
    const short = personaShortName(name);
    return {
      id: runPersona.persona_id,
      label,
      matchKeys: [name, label, short, personaShortName(label)],
    };
  });
}

function groupPersonaInsights(
  groups: PersonaInsightGroup[],
  insights: RunInsight[],
): Map<string, RunInsight[]> {
  const grouped = new Map<string, RunInsight[]>(
    groups.map((group) => [group.id, []]),
  );
  for (const insight of insights) {
    if (isJourneyInsight(insight) || !insight.persona) {
      continue;
    }
    const insightKey = personaShortName(insight.persona);
    const group = groups.find((candidate) =>
      candidate.matchKeys.some(
        (key) =>
          key === insight.persona ||
          personaShortName(key) === insightKey ||
          key === insightKey,
      ),
    );
    if (!group) {
      continue;
    }
    const list = grouped.get(group.id) ?? [];
    list.push(insight);
    grouped.set(group.id, list);
  }
  return grouped;
}

function formatInsightObservation(insight: RunInsight): string {
  const persona = insight.persona;
  let message = insight.message;
  if (!persona) {
    return message;
  }
  const reportedPrefix = `${persona} reported `;
  if (message.startsWith(reportedPrefix)) {
    message = `Reported ${message.slice(reportedPrefix.length)}`;
  }
  const blockedPrefix = `${persona} was blocked at `;
  if (message.startsWith(blockedPrefix)) {
    message = `Blocked at ${message.slice(blockedPrefix.length)}`;
  }
  const finishedPrefix = `${persona} finished without`;
  if (message.startsWith(finishedPrefix)) {
    message = `Finished without${message.slice(finishedPrefix.length)}`;
  }
  return message;
}

function formatInsightSuggestion(insight: RunInsight): string {
  const persona = insight.persona;
  if (!persona) {
    return insight.suggestion;
  }
  return insight.suggestion
    .replace(
      `Tighten ${persona}'s constraints to require verbatim tool output before reporting a finding.`,
      'Require verbatim tool output before reporting a finding.',
    )
    .replace(
      `Tighten ${persona}'s constraints to require`,
      'Require',
    )
    .replace(
      `Review journey instructions for phases where ${persona} gets blocked.`,
      'Review journey instructions for phases where this persona gets blocked.',
    )
    .replace(
      `Make ${persona}'s perspective more specific so they report`,
      "Make this persona's perspective more specific so they report",
    )
    .replace(
      `Review ${persona}'s persona fields for clearer evaluation boundaries.`,
      "Review this persona's fields for clearer evaluation boundaries.",
    );
}

function InsightCard({ insight }: { insight: RunInsight }) {
  return (
    <li className="run-insight-card">
      <p className="run-insight-card__message">
        {formatInsightObservation(insight)}
      </p>
      <p className="run-insight-card__suggestion">
        <strong>Suggestion:</strong> {formatInsightSuggestion(insight)}
      </p>
    </li>
  );
}

function InsightsSection({
  insights,
  personaGroups,
  journeyName,
  pending,
  pendingLabel,
}: {
  insights: RunInsight[];
  personaGroups: PersonaInsightGroup[];
  journeyName: string | null;
  pending: boolean;
  pendingLabel: string;
}) {
  const journeyInsights = insights.filter(isJourneyInsight);
  const personaInsightsById = groupPersonaInsights(personaGroups, insights);

  return (
    <section className="run-insights-section">
      <div className="run-insights-section__header">
        <h4 className="run-insights-section__title">Insights</h4>
        {pending && (
          <span className="run-insights-section__status">{pendingLabel}</span>
        )}
      </div>
      {pending ? (
        <p className="empty-state">
          Insights will appear after all personas finish and the orchestrator verifies findings.
        </p>
      ) : (
        <>
          <div className="run-insights-group">
            <h5 className="run-insights-group__title">Personas</h5>
            <div className="run-insights-personas">
              {personaGroups.map((group) => {
                const personaInsights = personaInsightsById.get(group.id) ?? [];
                return (
                  <div key={group.id} className="run-insights-persona">
                    <h6 className="run-insights-persona__name">{group.label}</h6>
                    {personaInsights.length === 0 ? (
                      <p className="run-insights-persona__empty">
                        No orchestrator insights for this persona.
                      </p>
                    ) : (
                      <ul className="run-insights-list run-insights-list--scroll">
                        {personaInsights.map((insight, index) => (
                          <InsightCard
                            key={`${group.id}-${insight.kind}-${index}`}
                            insight={insight}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="run-insights-group">
            <h5 className="run-insights-group__title">
              Journey{journeyName ? ` · ${journeyName}` : ''}
            </h5>
            {journeyInsights.length === 0 ? (
              <p className="run-insights-persona__empty">No journey-level insights.</p>
            ) : (
              <ul className="run-insights-list run-insights-list--scroll">
                {journeyInsights.map((insight, index) => (
                  <InsightCard
                    key={`journey-${insight.kind}-${index}`}
                    insight={insight}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

type FindingRow = FindingResponse & {
  personaLabel?: string;
  personaLabels?: string[];
  verification_status?: VerificationStatus;
  verification_note?: string;
};

function FindingsSection({
  findings,
  findingsPending,
  emptyMessage,
  exportFilename,
  title = 'Findings',
  showPersonaColumn = false,
  personaColumnLabel = 'Persona',
  personaOptions = [],
}: {
  findings: FindingRow[];
  findingsPending: boolean;
  emptyMessage: string;
  exportFilename: string;
  title?: string;
  showPersonaColumn?: boolean;
  personaColumnLabel?: string;
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
      if (personaFilter) {
        const labels = f.personaLabels ?? (f.personaLabel ? [f.personaLabel] : []);
        if (!labels.includes(personaFilter)) return false;
      }
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
        <div className="findings-section__header-main">
          <h4 className="findings-section__title">
            {title}
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
          </div>
        </div>
        <button
          type="button"
          className="findings-export-btn"
          title="export to csv"
          aria-label="export to csv"
          disabled={filteredFindings.length === 0}
          onClick={() => exportFindingsToCsv(filteredFindings, exportFilename, { includePersonas: showPersonaColumn })}
        >
          <IconExport className="findings-export-btn__icon" />
        </button>
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
                    <span className="data-table__th-label">{personaColumnLabel}</span>
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
                    <td>
                      <div className="finding-title-cell">
                        <span>{f.title}</span>
                        {f.verification_status && (
                          <span
                            className={`finding-verification finding-verification--${f.verification_status}`}
                          >
                            {verificationLabel(f.verification_status)}
                          </span>
                        )}
                      </div>
                    </td>
                    {showPersonaColumn && (
                <td>{(f.personaLabels ?? (f.personaLabel ? [f.personaLabel] : [])).join(', ')}</td>
              )}
                    <td>{f.phase}</td>
                  </tr>
                  {expandedFindings.has(f.id) && (
                    <tr className="finding-detail-row">
                      <td colSpan={columnCount}>
                        <div className="finding-detail">
                          {f.verification_note && (
                            <div className="finding-verification-note">
                              <strong>Verification</strong>
                              <p>{f.verification_note}</p>
                            </div>
                          )}
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


type OrchestratorDotState = 'idle' | 'live' | 'done' | 'error';

function orchestratorDotState(
  runStatus: string,
  personas: RunPersonaDetail[],
  triage: RunTriage | null | undefined,
): OrchestratorDotState {
  if (triage?.error) {
    return 'error';
  }
  if (triage?.status === 'complete') {
    return 'done';
  }

  const personasTerminal = personas.every(
    (persona) => persona.status === 'completed' || persona.status === 'blocked',
  );
  const runActive = runStatus === 'pending' || runStatus === 'running';

  if (
    personasTerminal &&
    (triage?.status === 'pending' || (!triage && !runActive))
  ) {
    return 'live';
  }

  return 'idle';
}

function orchestratorDotLabel(state: OrchestratorDotState): string {
  switch (state) {
    case 'error':
      return 'Orchestrator triage failed';
    case 'done':
      return 'Orchestrator triage complete';
    case 'live':
      return 'Orchestrator triaging findings';
    default:
      return 'Orchestrator waiting for personas';
  }
}

function orchestratorDotClass(state: OrchestratorDotState): string {
  switch (state) {
    case 'error':
      return 'persona-picker-dot--error';
    case 'done':
      return 'persona-picker-dot--done';
    case 'live':
      return 'persona-picker-dot--live persona-picker-dot--pulse';
    default:
      return 'persona-picker-dot--overview';
  }
}


function insightsPendingLabel(
  runStatus: string,
  personas: RunPersonaDetail[],
  triage: RunTriage | null | undefined,
): string {
  switch (orchestratorDotState(runStatus, personas, triage)) {
    case 'live':
      return 'Orchestrator triaging…';
    case 'idle':
      return 'Waiting for all personas to complete…';
    default:
      return 'Preparing insights…';
  }
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
      const triageStatus = query.state.data?.triage?.status;
      if (status === 'pending' || status === 'running') return 3000;
      if (
        (status === 'completed' || status === 'failed') &&
        (!triageStatus || triageStatus === 'pending')
      ) {
        return 3000;
      }
      return false;
    },
  });

  const { data: allPersonas } = useQuery({
    queryKey: ['personas'],
    queryFn: getPersonas,
  });

  const { data: journeys } = useQuery({
    queryKey: ['journeys'],
    queryFn: getJourneys,
  });

  const [activeTab, setActiveTab] = useState<PersonaTab>(0);
  const pageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const durationMs = 3200;
    el.style.setProperty('--running-dot-duration', `${durationMs}ms`);
    el.style.setProperty(
      '--running-dot-delay',
      `${-(performance.now() % durationMs) / 1000}s`,
    );
  }, [id, run?.id]);

  if (isLoading) return <p className="loading">Loading run details...</p>;
  if (error) return <p className="error">Failed to load run details.</p>;
  if (!run) return null;

  const personaName = (personaId: string) =>
    allPersonas?.find((p) => p.id === personaId)?.name || personaId.slice(0, 8);

  const journeyName =
    journeys?.find((journey) => journey.id === run.journey_id)?.name ?? null;

  const isOverview = activeTab === 'overview';
  const activePersona: RunPersonaDetail | undefined =
    typeof activeTab === 'number' ? run.personas[activeTab] : undefined;
  const isRunActive = run.status === 'pending' || run.status === 'running';
  const personaFindings = activePersona?.findings ?? [];
  const findingsPending =
    activePersona?.status === 'running' || activePersona?.status === 'pending';
  const triage = run.triage;
  const overviewFindings: FindingRow[] = (triage?.triaged_findings ?? []).map(
    (finding: TriagedFinding) => ({
      ...finding,
      personaLabels: finding.personas,
      verification_status: finding.verification_status,
      verification_note: finding.verification_note,
    }),
  );
  const triageFinished = triage?.status === 'complete';
  const overviewFindingsPending =
    !triageFinished &&
    (isRunActive ||
      triage?.status === 'pending' ||
      ((run.status === 'completed' || run.status === 'failed') && !triage));
  const overviewInsights = triage?.insights ?? [];
  const overviewInsightsPending = !triageFinished && overviewFindingsPending;
  const overviewPersonaOptions = [
    ...new Set(overviewFindings.flatMap((finding) => finding.personaLabels ?? [])),
  ].sort();
  const orchestratorDot = orchestratorDotState(run.status, run.personas, triage);

  return (
    <div className="page" ref={pageRef}>
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
            personaStatuses={run.personas.map((persona) => persona.status)}
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
        <div className="run-meta__repo">
          Repository:{' '}
          <a href={run.repo_url} target="_blank" rel="noopener noreferrer">
            {run.repo_url}
          </a>
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
              title={orchestratorDotLabel(orchestratorDot)}
            >
              <span
                className={`persona-picker-dot ${orchestratorDotClass(orchestratorDot)}`}
                aria-hidden="true"
              />
              <span className="persona-picker-name">Orchestrator</span>
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
              <section className="run-insights-panel">
                <InsightsSection
                  insights={overviewInsights}
                  personaGroups={buildPersonaInsightGroups(
                    run.personas,
                    allPersonas,
                    personaName,
                  )}
                  journeyName={journeyName}
                  pending={overviewInsightsPending}
                  pendingLabel={insightsPendingLabel(run.status, run.personas, triage)}
                />
              </section>
              <section className="run-findings-panel">
                <FindingsSection
                  title="Triaged Findings"
                  findings={overviewFindings}
                  findingsPending={overviewFindingsPending}
                  emptyMessage={
                    overviewFindingsPending
                      ? 'Triaged findings will appear after all personas finish and the orchestrator verifies reports.'
                      : 'No triaged findings for this run.'
                  }
                  exportFilename={`${sanitizeFilename(run.name)}-triaged-findings.csv`}
                  showPersonaColumn
                  personaColumnLabel="Personas"
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
                  <PhaseProgress phases={run.journey_phases} persona={activePersona} journeyName={journeyName ?? undefined} />
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
