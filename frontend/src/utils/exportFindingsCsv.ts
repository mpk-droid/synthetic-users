import type { FindingResponse } from '../types';

function csvCell(value: string | null | undefined): string {
  const text = value ?? '';
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportFindingsToCsv(
  findings: FindingResponse[],
  filename: string,
): void {
  const headers = [
    'id',
    'severity',
    'category',
    'title',
    'phase',
    'description',
    'evidence',
    'file_path',
    'suggestion',
  ];

  const rows = findings.map((finding) =>
    [
      finding.id,
      finding.severity,
      finding.category,
      finding.title,
      finding.phase,
      finding.description,
      finding.evidence,
      finding.file_path,
      finding.suggestion,
    ]
      .map(csvCell)
      .join(','),
  );

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function sanitizeFilename(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'findings';
}
