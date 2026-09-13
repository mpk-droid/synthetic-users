interface WorkInProgressBannerProps {
  children?: React.ReactNode;
}

export function WorkInProgressBanner({ children }: WorkInProgressBannerProps) {
  return (
    <div className="wip-banner" role="status">
      <span className="badge badge--wip">Work in progress</span>
      <p>
        {children ??
          'This feature is not ready for general use yet. Functionality may change or be disabled.'}
      </p>
    </div>
  );
}
