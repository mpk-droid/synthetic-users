import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cancelRun, deleteRun } from '../api/client';
import { IconClose, IconTrash } from './NavIcons';

const ACTIVE_STATUSES = new Set(['pending', 'running']);

function isStoppable(runStatus: string, personaStatuses?: string[]): boolean {
  if (ACTIVE_STATUSES.has(runStatus.toLowerCase())) {
    return true;
  }
  return (
    personaStatuses?.some((status) => ACTIVE_STATUSES.has(status.toLowerCase())) ??
    false
  );
}

type RunActionsProps = {
  runId: string;
  runName: string;
  status: string;
  personaStatuses?: string[];
  variant?: 'table' | 'header';
  onDeleted?: () => void;
};

export default function RunActions({
  runId,
  runName,
  status,
  personaStatuses,
  variant = 'table',
  onDeleted,
}: RunActionsProps) {
  const queryClient = useQueryClient();
  const canStop = isStoppable(status, personaStatuses);
  const wrapperClass =
    variant === 'header' ? 'run-header-actions' : 'data-table__actions';

  const cancelMutation = useMutation({
    mutationFn: cancelRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['run', runId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      onDeleted?.();
    },
  });

  const handleStop = () => {
    if (
      window.confirm(
        `Stop run "${runName}"? This stops all persona activity immediately.`,
      )
    ) {
      cancelMutation.mutate(runId);
    }
  };

  const handleDelete = () => {
    if (
      window.confirm(
        `Delete run "${runName}"? This permanently removes the run and its findings.`,
      )
    ) {
      deleteMutation.mutate(runId);
    }
  };

  const pending = cancelMutation.isPending || deleteMutation.isPending;
  const stopTitle = canStop
    ? `Stop ${runName}`
    : `Stop unavailable while run is ${status}`;

  return (
    <div className={wrapperClass}>
      <button
        type="button"
        className="btn btn--icon run-action-btn run-action-btn--stop"
        title={stopTitle}
        aria-label={stopTitle}
        disabled={!canStop || pending}
        onClick={handleStop}
      >
        <IconClose className="run-action-btn__icon" />
      </button>
      <button
        type="button"
        className="btn btn--icon btn--danger-text run-action-btn"
        title={`Delete ${runName}`}
        aria-label={`Delete ${runName}`}
        disabled={pending}
        onClick={handleDelete}
      >
        <IconTrash className="run-action-btn__icon" />
      </button>
    </div>
  );
}
