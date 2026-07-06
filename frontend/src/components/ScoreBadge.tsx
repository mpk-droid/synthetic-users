interface ScoreBadgeProps {
  score: string | null;
  size?: 'small' | 'large';
}

const scoreColors: Record<string, string> = {
  GREEN: 'var(--color-green)',
  YELLOW: 'var(--color-yellow)',
  RED: 'var(--color-red)',
};

export default function ScoreBadge({ score, size = 'small' }: ScoreBadgeProps) {
  if (!score) {
    return <span className="score-badge score-badge--none">--</span>;
  }

  const color = scoreColors[score.toUpperCase()] || 'var(--color-gray-400)';
  const dotSize = size === 'large' ? 16 : 10;

  return (
    <span className={`score-badge score-badge--${size}`}>
      <span
        className="score-dot"
        style={{
          backgroundColor: color,
          width: dotSize,
          height: dotSize,
        }}
      />
      <span className="score-label">{score}</span>
    </span>
  );
}
