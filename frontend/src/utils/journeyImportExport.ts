import { createJourney, createJourneyPhase } from '../api/client';
import type { JourneyResponse } from '../types';
import { downloadJson } from './jsonDownload';

export const JOURNEYS_EXPORT_VERSION = 1;

export interface JourneyPhaseExportItem {
  order: number;
  name: string;
  instructions: string;
}

export interface JourneyExportItem {
  name: string;
  description?: string | null;
  phases: JourneyPhaseExportItem[];
}

export interface JourneyExportDocument {
  version: number;
  type: 'journeys';
  exported_at: string;
  items: JourneyExportItem[];
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

function parsePhaseItem(raw: unknown, journeyIndex: number, phaseIndex: number): JourneyPhaseExportItem {
  if (!raw || typeof raw !== 'object') {
    throw new Error(
      `Invalid import: journeys[${journeyIndex}].phases[${phaseIndex}] must be an object.`,
    );
  }
  const phase = raw as Record<string, unknown>;
  const order = phase.order;
  if (typeof order !== 'number' || !Number.isInteger(order) || order < 1) {
    throw new Error(
      `Invalid import: journeys[${journeyIndex}].phases[${phaseIndex}].order must be a positive integer.`,
    );
  }

  return {
    order,
    name: requireString(
      phase,
      'name',
      `journeys[${journeyIndex}].phases[${phaseIndex}].name`,
    ),
    instructions: requireString(
      phase,
      'instructions',
      `journeys[${journeyIndex}].phases[${phaseIndex}].instructions`,
    ),
  };
}

function parseJourneyItem(raw: unknown, index: number): JourneyExportItem {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid import: journey at index ${index} must be an object.`);
  }
  const item = raw as Record<string, unknown>;
  const phases = item.phases;
  if (!Array.isArray(phases)) {
    throw new Error(`Invalid import: journeys[${index}].phases must be an array.`);
  }

  const parsed: JourneyExportItem = {
    name: requireString(item, 'name', `journeys[${index}].name`),
    phases: phases.map((phase, phaseIndex) => parsePhaseItem(phase, index, phaseIndex)),
  };

  if (item.description !== undefined && item.description !== null) {
    if (typeof item.description !== 'string') {
      throw new Error(`Invalid import: journeys[${index}].description must be a string.`);
    }
    parsed.description = item.description;
  }

  return parsed;
}

export function validateJourneysImport(data: unknown): JourneyExportItem[] {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid import: expected a JSON object.');
  }

  const doc = data as Record<string, unknown>;
  if (doc.type !== undefined && doc.type !== 'journeys') {
    throw new Error('Invalid import: JSON type must be "journeys".');
  }

  const items = doc.items;
  if (!Array.isArray(items)) {
    throw new Error('Invalid import: missing "items" array.');
  }
  if (items.length === 0) {
    throw new Error('Invalid import: "items" array is empty.');
  }

  return items.map((item, index) => parseJourneyItem(item, index));
}

export function buildJourneysExport(
  journeys: JourneyResponse[],
  selectedIds: Set<string>,
): JourneyExportDocument {
  const items = journeys
    .filter((journey) => selectedIds.has(journey.id))
    .map((journey) => ({
      name: journey.name,
      description: journey.description,
      phases: [...journey.phases]
        .sort((a, b) => a.order - b.order)
        .map((phase) => ({
          order: phase.order,
          name: phase.name,
          instructions: phase.instructions,
        })),
    }));

  return {
    version: JOURNEYS_EXPORT_VERSION,
    type: 'journeys',
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

export function exportJourneysJson(
  journeys: JourneyResponse[],
  selectedIds: Set<string>,
): void {
  const doc = buildJourneysExport(journeys, selectedIds);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson(`journeys-export-${stamp}.json`, doc);
}

export function exportJourneyJson(journey: JourneyResponse): void {
  const doc = buildJourneysExport([journey], new Set([journey.id]));
  downloadJson(exportFilename('journey', journey.name), doc);
}

export async function importJourneysFromItems(items: JourneyExportItem[]): Promise<void> {
  for (const item of items) {
    const journey = await createJourney({
      name: item.name,
      description: item.description || undefined,
    });

    const phases = [...item.phases].sort((a, b) => a.order - b.order);
    for (const phase of phases) {
      await createJourneyPhase(journey.id, {
        name: phase.name,
        instructions: phase.instructions,
      });
    }
  }
}
