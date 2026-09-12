import { IconExport } from './NavIcons';

interface DetailExportButtonProps {
  onClick: () => void;
}

export function DetailExportButton({ onClick }: DetailExportButtonProps) {
  return (
    <button type="button" className="btn btn--secondary" onClick={onClick}>
      <IconExport className="btn__icon" />
      Export
    </button>
  );
}
