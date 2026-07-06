interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, { bg: string; color: string }> = {
  pending: { bg: 'var(--color-gray-100)', color: 'var(--color-gray-600)' },
  running: { bg: '#dbeafe', color: '#1d4ed8' },
  completed: { bg: '#dcfce7', color: '#15803d' },
  blocked: { bg: '#fef3c7', color: '#a16207' },
  failed: { bg: '#fee2e2', color: '#b91c1c' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status.toLowerCase()] || statusStyles.pending;

  return (
    <span
      className="status-badge"
      style={{
        backgroundColor: style.bg,
        color: style.color,
      }}
    >
      {status}
    </span>
  );
}
