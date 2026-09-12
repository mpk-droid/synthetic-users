import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cancelRun, deleteRun } from '../api/client';
import { IconClose, IconTrash } from './NavIcons';

const ACTIVE_STATUSES = new Set(['pending', 'running']);

type RunActionsProps = {
  runId: string;
  runName: string;
  status: string;
  variant?: 'table' | 'header';
  onDeleted?: () => void;
};

export default function RunActions({
  runId,
  runName,
  status,
  variant = 'table',
  onDeleted,
}: RunActionsProps) {
  const queryClient = useQueryClient();
  const canCancel = ACTIVE_STATUSES.has(status);
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

  return (
    <div className={wrapperClass}>
      {canCancel && (
        <button
          type="button"
          className="btn btn--icon btn--warning-text run-action-btn"
          title={`Cancel ${runName}`}
          aria-label={`Cancel ${runName}`}
          disabled={pending}
          onClick={handleCancel}
        >
          <IconClose className="run-action-btn__icon" />
        </button>
      )}
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
