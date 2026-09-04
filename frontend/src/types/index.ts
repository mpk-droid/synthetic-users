export interface PersonaResponse {
  id: string;
  name: string;
  identity: string;
  perspective: string;
  constraints: string;
  expertise_level: string;
  system_prompt: string | null;
  prompt_approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface PersonaCreate {
  name: string;
  identity: string;
  perspective: string;
  constraints: string;
  expertise_level: string;
}

export interface PersonaUpdate {
  name?: string;
  identity?: string;
  perspective?: string;
  constraints?: string;
  expertise_level?: string;
}

export interface JourneyPhaseResponse {
  id: string;
  order: number;
  name: string;
  instructions: string;
  created_at: string;
}

export interface JourneyPhaseCreate {
  name: string;
  instructions: string;
  order?: number;
}

export interface JourneyPhaseUpdate {
  name?: string;
  instructions?: string;
  order?: number;
}

export interface JourneyResponse {
  id: string;
  name: string;
  description: string | null;
  phases: JourneyPhaseResponse[];
  created_at: string;
  updated_at: string;
}

export interface JourneyCreate {
  name: string;
  description?: string;
}

export interface JourneyUpdate {
  name?: string;
  description?: string;
}

export interface EnvironmentResponse {
  id: string;
  name: string;
  image: string;
  description: string | null;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface EnvironmentCreate {
  name: string;
  image: string;
  description?: string;
}

export interface PersonaEnvironmentSpec {
  persona_id: string;
  environment_ids: string[];
}

export interface JobCreate {
  name: string;
  repo_url: string;
  persona_environments: PersonaEnvironmentSpec[];
  journey_id: string;
  model: string;
  config?: object;
}

export interface JobResponse {
  id: string;
  name: string;
  repo_url: string;
  persona_environments: PersonaEnvironmentSpec[];
  journey_id: string;
  model: string;
  config: object;
  created_at: string;
}

export interface FindingResponse {
  id: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  evidence: string;
  file_path: string | null;
  suggestion: string | null;
  phase: string;
  verified: boolean;
}

export interface JourneyPhaseRef {
  order: number;
  name: string;
}

export interface PhaseTimes {
  started_at?: string | null;
  completed_at?: string | null;
}

export interface RunActivityEntry {
  at: string;
  type: string;
  message: string;
}

export interface RunPersonaDetail {
  id: string;
  persona_id: string;
  status: string;
  current_phase: string | null;
  blocked_phase: string | null;
  blocked_reason: string | null;
  phase_summaries: Record<string, string>;
  phase_times: Record<string, PhaseTimes>;
  activity: RunActivityEntry[];
  environment: { id: string; name: string; image: string } | null;
  findings: FindingResponse[];
}

export interface RunResponse {
  id: string;
  job_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  score: string | null;
  score_rationale: string | null;
  error: string | null;
  created_at: string;
}

export interface RunDetailResponse {
  id: string;
  job_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  score: string | null;
  score_rationale: string | null;
  error: string | null;
  created_at: string;
  journey_phases: JourneyPhaseRef[];
  personas: RunPersonaDetail[];
}

export interface GlobalFindingResponse {
  id: string;
  repo_url: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  evidence: string;
  file_path: string | null;
  suggestion: string | null;
  first_seen_run_id: string;
  last_seen_run_id: string;
  seen_count: number;
  persona_names: string[];
  status: string;
  created_at: string;
  updated_at: string;
}
