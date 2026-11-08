import type { AIExecution } from '../../browser/ai';

export function AIExecutionDetails({ execution }: { execution: AIExecution }) {
  if (
    !execution.applied &&
    !execution.verifiedWrites &&
    !execution.startedCommands &&
    !execution.pendingActions &&
    !execution.errors
  )
    return null;
  let notice = 'The last tool returned an error. This run needs attention.';
  if (execution.pendingActions)
    notice = 'A page action has not been confirmed as complete.';
  else if (execution.failedCommands)
    notice = 'A command failed or was interrupted. This run needs attention.';
  else if (execution.unfinishedCommands)
    notice = 'A command has not been confirmed as finished.';
  else if (execution.startedCommands > execution.reviewedCommands)
    notice = 'A command was started, but its output has not been reviewed.';
  return (
    <div className="ai-execution-details">
      {execution.incomplete && <p role="status">{notice}</p>}
      <details>
        <summary>Work performed</summary>
        <ul>
          {!!execution.applied && (
            <li>
              {execution.applied} action{execution.applied === 1 ? '' : 's'}{' '}
              applied
            </li>
          )}
          {!!execution.verifiedWrites && (
            <li>
              {execution.verifiedWrites} file write
              {execution.verifiedWrites === 1 ? '' : 's'} verified
            </li>
          )}
          {!!execution.startedCommands && (
            <li>
              {execution.startedCommands} command
              {execution.startedCommands === 1 ? '' : 's'} started;{' '}
              {execution.reviewedCommands} output
              {execution.reviewedCommands === 1 ? '' : 's'} inspected.
              {execution.successfulCommands !== undefined ? (
                <>
                  {' '}
                  {execution.successfulCommands} exited successfully;{' '}
                  {execution.failedCommands || 0} failed or interrupted;{' '}
                  {execution.unfinishedCommands || 0} awaiting confirmation.
                </>
              ) : (
                ' Command exit status was not recorded.'
              )}
            </li>
          )}
          {!!execution.errors && (
            <li>
              {execution.errors} tool error{execution.errors === 1 ? '' : 's'}{' '}
              occurred during the run
            </li>
          )}
        </ul>
      </details>
    </div>
  );
}
