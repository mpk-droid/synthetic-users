interface SeverityBadgeProps {
  severity: string;
}

const severityColors: Record<string, string> = {
  critical: 'var(--color-severity-critical)',
  high: 'var(--color-severity-high)',
  medium: 'var(--color-severity-medium)',
  low: 'var(--color-severity-low)',
  info: 'var(--color-severity-info)',
};

export default function SeverityBadge({ severity }: SeverityBadgeProps) {
  const color = severityColors[severity.toLowerCase()] || 'var(--color-gray-400)';

  return (
    <span
      className="severity-badge"
      style={{
        backgroundColor: color,
      }}
    >
      {severity}
    </span>
  );
}
