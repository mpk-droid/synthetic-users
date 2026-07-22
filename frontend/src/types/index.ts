export interface PersonaResponse {
  id: string;
  name: string;
  identity: string;
  perspective: string;
  constraints: string;
  expertise_level: string;
  system_prompt: string | null;
  prompt_approved: boolean;
  pack_id: string | null;
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

export interface PackResponse {
  id: string;
  name: string;
  description: string | null;
  journey_id: string | null;
  is_builtin: boolean;
  personas: PersonaResponse[];
  created_at: string;
  updated_at: string;
}

export interface JobCreate {
  name: string;
  repo_url: string;
  persona_ids: string[];
  journey_id: string;
  model: string;
  config?: object;
}

export interface JobResponse {
  id: string;
  name: string;
  repo_url: string;
  persona_ids: string[];
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

export interface RunPersonaDetail {
  id: string;
  persona_id: string;
  status: string;
  blocked_phase: string | null;
  blocked_reason: string | null;
  phase_summaries: Record<string, string>;
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
