import {
  approvePersonaPrompt,
  createPersona,
  updatePersona,
} from '../api/client';
import type { PersonaResponse } from '../types';
import { downloadJson } from './jsonDownload';

export const PERSONAS_EXPORT_VERSION = 1;

export interface PersonaExportItem {
  name: string;
  identity: string;
  perspective: string;
  constraints: string;
  role_label: string;
  system_prompt?: string | null;
  prompt_approved?: boolean;
}

export interface PersonaExportDocument {
  version: number;
  type: 'personas';
  exported_at: string;
  items: PersonaExportItem[];
}

function requireString(
  obj: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid import: ${label} must be a non-empty string.`);
  }
  return value;
}

function parsePersonaItem(raw: unknown, index: number): PersonaExportItem {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid import: persona at index ${index} must be an object.`);
  }
  const item = raw as Record<string, unknown>;
  const parsed: PersonaExportItem = {
    name: requireString(item, 'name', `personas[${index}].name`),
    role_label: requireString(item, 'role_label', `personas[${index}].role_label`),
    identity: requireString(item, 'identity', `personas[${index}].identity`),
    perspective: requireString(item, 'perspective', `personas[${index}].perspective`),
    constraints: requireString(item, 'constraints', `personas[${index}].constraints`),
  };

  if (item.system_prompt !== undefined && item.system_prompt !== null) {
    if (typeof item.system_prompt !== 'string') {
      throw new Error(`Invalid import: personas[${index}].system_prompt must be a string.`);
    }
    parsed.system_prompt = item.system_prompt;
  }

  if (item.prompt_approved !== undefined && typeof item.prompt_approved !== 'boolean') {
    throw new Error(`Invalid import: personas[${index}].prompt_approved must be a boolean.`);
  }
  if (typeof item.prompt_approved === 'boolean') {
    parsed.prompt_approved = item.prompt_approved;
  }

  return parsed;
}

export function validatePersonasImport(data: unknown): PersonaExportItem[] {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid import: expected a JSON object.');
  }

  const doc = data as Record<string, unknown>;
  if (doc.type !== undefined && doc.type !== 'personas') {
    throw new Error('Invalid import: JSON type must be "personas".');
  }

  const items = doc.items;
  if (!Array.isArray(items)) {
    throw new Error('Invalid import: missing "items" array.');
  }
  if (items.length === 0) {
    throw new Error('Invalid import: "items" array is empty.');
  }

  return items.map((item, index) => parsePersonaItem(item, index));
}

export function buildPersonasExport(
  personas: PersonaResponse[],
  selectedIds: Set<string>,
): PersonaExportDocument {
  const items = personas
    .filter((persona) => selectedIds.has(persona.id))
    .map((persona) => ({
      name: persona.name,
      identity: persona.identity,
      perspective: persona.perspective,
      constraints: persona.constraints,
      role_label: persona.role_label,
      system_prompt: persona.system_prompt,
      prompt_approved: persona.prompt_approved,
    }));

  return {
    version: PERSONAS_EXPORT_VERSION,
    type: 'personas',
    exported_at: new Date().toISOString(),
    items,
  };
}

function exportFilename(prefix: string, name: string): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || prefix;
  return `${prefix}-${slug}.json`;
}

export function exportPersonasJson(
  personas: PersonaResponse[],
  selectedIds: Set<string>,
): void {
  const doc = buildPersonasExport(personas, selectedIds);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson(`personas-export-${stamp}.json`, doc);
}

export function exportPersonaJson(persona: PersonaResponse): void {
  const doc = buildPersonasExport([persona], new Set([persona.id]));
  downloadJson(exportFilename('persona', persona.name), doc);
}

export async function importPersonasFromItems(items: PersonaExportItem[]): Promise<void> {
  for (const item of items) {
    const created = await createPersona({
      name: item.name,
      role_label: item.role_label,
      identity: item.identity,
      perspective: item.perspective,
      constraints: item.constraints,
    });

    if (item.system_prompt) {
      await updatePersona(created.id, { system_prompt: item.system_prompt });
      if (item.prompt_approved) {
        await approvePersonaPrompt(created.id);
      }
    }
  }
}
