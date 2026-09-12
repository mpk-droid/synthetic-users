import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cancelRun, deleteRun } from '../api/client';
import { IconClose, IconTrash } from './NavIcons';

const ACTIVE_STATUSES = new Set(['pending', 'running']);

function isCancellable(runStatus: string, personaStatuses?: string[]): boolean {
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
  const canCancel = isCancellable(status, personaStatuses);
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

  const handleCancel = () => {
    if (
      window.confirm(
        `Cancel run "${runName}"? This stops all persona activity immediately.`,
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
  const cancelTitle = canCancel
    ? `Cancel ${runName}`
    : `Cancel unavailable while run is ${status}`;

  return (
    <div className={wrapperClass}>
      <button
        type="button"
        className="btn run-action-btn run-action-btn--cancel"
        title={cancelTitle}
        aria-label={cancelTitle}
        disabled={!canCancel || pending}
        onClick={handleCancel}
      >
        <IconClose className="run-action-btn__icon" />
        <span>Cancel</span>
      </button>
      <button
        type="button"
        className="btn run-action-btn run-action-btn--delete"
        title={`Delete ${runName}`}
        aria-label={`Delete ${runName}`}
        disabled={pending}
        onClick={handleDelete}
      >
        <IconTrash className="run-action-btn__icon" />
        <span>Delete</span>
      </button>
    </div>
  );
}
