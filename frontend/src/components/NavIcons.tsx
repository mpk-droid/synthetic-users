import type { ReactNode } from 'react';

type IconProps = {
  className?: string;
};

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconDashboard({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

export function IconPersonas({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M14 19c0-2.2 1.8-4 4-4" />
    </Icon>
  );
}

export function IconJourneys({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 6h16" />
      <path d="M7 6v4l3 3 3-3V6" />
      <path d="M10 13v5" />
      <path d="M14 18h6" />
      <path d="M17 15v6" />
    </Icon>
  );
}

export function IconEnvironments({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="3" y="5" width="18" height="6" rx="1.5" />
      <rect x="5" y="13" width="14" height="6" rx="1.5" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconAbout({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconApiDocs({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M8 4h8l4 4v12H8z" />
      <path d="M16 4v4h4" />
      <path d="M10 12h6" />
      <path d="M10 16h6" />
    </Icon>
  );
}

export function IconExport({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 4v10" />
      <path d="M8 10l4 4 4-4" />
      <path d="M5 18h14" />
    </Icon>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Icon>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M7 7l1 12h8l1-12" />
    </Icon>
  );
}
