interface SeverityBadgeProps {
  severity: string;
}

const severityColors: Record<string, string> = {
  critical: 'var(--color-severity-critical)',
  needs_attention: 'var(--color-severity-needs-attention)',
  nits: 'var(--color-severity-nits)',
  // Legacy values from older runs
  high: 'var(--color-severity-needs-attention)',
  medium: 'var(--color-severity-needs-attention)',
  low: 'var(--color-severity-nits)',
  info: 'var(--color-severity-nits)',
};

const severityLabels: Record<string, string> = {
  critical: 'Critical',
  needs_attention: 'Needs attention',
  nits: 'Nits',
  high: 'Needs attention',
  medium: 'Needs attention',
  low: 'Nits',
  info: 'Nits',
};

function normalizeSeverityKey(severity: string): string {
  const key = severity.toLowerCase().replace(/-/g, '_').replace(/ /g, '_');
  if (key in severityLabels) return key;
  if (key === 'needsattention') return 'needs_attention';
  return key;
}

export default function SeverityBadge({ severity }: SeverityBadgeProps) {
  const key = normalizeSeverityKey(severity);
  const color = severityColors[key] || 'var(--color-gray-400)';
  const label = severityLabels[key] || severity;

  return (
    <span
      className="severity-badge"
      style={{
        backgroundColor: color,
      }}
    >
      {label}
    </span>
  );
}
