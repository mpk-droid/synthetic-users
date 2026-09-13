RunDetail.tsx 1359L cognitive
// /Users/mpk/Workspace/synthetic-users/frontend/src/pages/RunDetail.tsx
§ function currentPhaseNumber (L89-L107)
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
// ... 21 lines omitted
§ function partitionActivityByPhase (L129-L154)
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
// ... 425 lines omitted
§ function groupPersonaInsights (L580-L608)
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
// ... 63 lines omitted
§ function InsightsSection (L672-L767)
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
  const [expanded, setExpanded] = useState(false);
  const journeyInsights = insights.filter(isJourneyInsight);
  const personaInsightsById = groupPersonaInsights(personaGroups, insights);

  return (
    <section
      className={`run-insights-section${expanded ? ' run-insights-section--expanded' : ' run-insights-section--collapsed'}`}
    >
      <div className="run-insights-section__header">
        <button
          type="button"
          className="run-insights-section__toggle"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
        >
          <span
            className={`run-insights-section__chevron${expanded ? ' run-insights-section__chevron--open' : ''}`}
            aria-hidden="true"
          />
          <span className="run-insights-section__title">Insights</span>
          {!expanded && !pending && insights.length > 0 && (
            <span className="run-insights-section__count">({insights.length})</span>
          )}
        </button>
        {pending && (
          <span className="run-insights-section__status">{pendingLabel}</span>
        )}
      </div>
      {expanded && pending ? (
        <p className="empty-state">
          Insights will appear after all personas finish and the orchestrator verifies findings.
        </p>
      ) : expanded ? (
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
      ) : null}
    </section>
  );
}
// ... 8 lines omitted
§ function FindingsSection (L776-L825)
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

// ... 211 lines omitted
§ function orchestratorDotState (L1037-L1062)
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
// ... 46 lines omitted
§ function RunDetail (L1109-L1158)
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

7/48 chunks shown (2267 tokens)
[lean-ctx] full source: read "/Users/mpk/Workspace/synthetic-users/frontend/src/pages/RunDetail.tsx" directly (no MCP)  ·  or ctx_read("/Users/mpk/Workspace/synthetic-users/frontend/src/pages/RunDetail.tsx", mode="full")
