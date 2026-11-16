import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  RenderErrorBoundary,
  renderFailureMessage,
} from '../components/UI/RenderErrorBoundary';

it('preserves navigation and lets a failed panel retry', () => {
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
  let fail = true;
  function Panel() {
    if (fail) throw new Error('private note contents');
    return <div>Notes loaded</div>;
  }
  try {
    render(
      <>
        <nav>Browser navigation</nav>
        <RenderErrorBoundary label="Notes">
          <Panel />
        </RenderErrorBoundary>
      </>
    );
    expect(screen.getByText('Browser navigation')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Notes could not be displayed'
    );
    expect(screen.queryByText('private note contents')).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Notes loaded')).toBeInTheDocument();
  } finally {
    quiet.mockRestore();
  }
});

it('explains disk and loading failures without guessing', () => {
  expect(renderFailureMessage(new Error('ENOSPC: write failed'))).toContain(
    'Your disk is full'
  );
  expect(renderFailureMessage(new Error('Loading chunk 123 failed'))).toContain(
    'Quit and reopen'
  );
  expect(renderFailureMessage(new Error('unknown'))).not.toContain('disk');
});
