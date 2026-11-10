import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { ActivityPage } from '../components/UI/ActivityPage';

const entry = {
  id: 'one',
  title: 'Research ready',
  message: 'Review the verdict',
  source: 'ai' as const,
  asRead: false,
  createdAt: 1234,
  noteId: 'note-one',
  url: 'https://example.com',
};
let request: jest.Mock;
beforeEach(() => {
  request = jest.fn(async (input) =>
    input.action === 'list' ? [entry] : undefined
  );
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: {
      activity: request,
      onActivityChanged: () => () => {},
      browser: { tooltip: jest.fn(async () => undefined) },
    },
  });
});
it('shows unread activity with note and URL actions and opens the note', async () => {
  const open = jest.fn();
  window.addEventListener('kudiumbrowser-open-note', open);
  try {
    render(
      <Theme>
        <ActivityPage active />
      </Theme>
    );
    expect(await screen.findByLabelText('Unread activity')).toBeInTheDocument();
    expect(screen.getByText('Note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: entry.title }));
    expect(open.mock.calls[0][0].detail).toBe('note-one');
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({ action: 'read', id: entry.id })
    );
  } finally {
    window.removeEventListener('kudiumbrowser-open-note', open);
  }
});
it('deep links select an activity and bulk read is explicit', async () => {
  render(
    <Theme>
      <ActivityPage active />
    </Theme>
  );
  await screen.findByText(entry.title);
  act(() =>
    window.dispatchEvent(
      new CustomEvent('kudiumbrowser-open-activity', { detail: entry.id })
    )
  );
  await waitFor(() =>
    expect(document.getElementById('activity-one')).toHaveClass(
      'activity-selected'
    )
  );
  fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({ action: 'readAll' })
  );
});

it('expands and collapses events without a destination', async () => {
  request.mockImplementation(async (input) =>
    input.action === 'list'
      ? [{ ...entry, noteId: undefined, url: undefined }]
      : undefined
  );
  render(
    <Theme>
      <ActivityPage active />
    </Theme>
  );
  const summary = await screen.findByRole('button', { name: entry.title });
  fireEvent.click(summary);
  await waitFor(() => expect(summary).toHaveAttribute('aria-expanded', 'true'));
  fireEvent.click(summary);
  expect(summary).toHaveAttribute('aria-expanded', 'false');
  expect(request).not.toHaveBeenCalledWith({ action: 'readAll' });
});

it('opens a page from the card and copies without activating the destination', async () => {
  request.mockImplementation(async (input) =>
    input.action === 'list' ? [{ ...entry, noteId: undefined }] : undefined
  );
  const open = jest.spyOn(window, 'open').mockImplementation(() => null);
  const writeText = jest.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  try {
    render(
      <Theme>
        <ActivityPage active />
      </Theme>
    );
    const card = await screen.findByRole('button', { name: entry.title });
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith('#kudiumbrowser-activity-one');
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(card);
    expect(open).toHaveBeenCalledWith(
      entry.url,
      '_blank',
      'noopener,noreferrer'
    );
  } finally {
    open.mockRestore();
  }
});

it('deletes only the activity without opening its note', async () => {
  let deleted = false;
  request.mockImplementation(async (input) => {
    if (input.action === 'delete') deleted = true;
    return input.action === 'list' ? (deleted ? [] : [entry]) : undefined;
  });
  const open = jest.fn();
  window.addEventListener('kudiumbrowser-open-note', open);
  try {
    render(
      <Theme>
        <ActivityPage active />
      </Theme>
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete activity' })
    );
    await screen.findByText('No activity yet');
    expect(request).toHaveBeenCalledWith({ action: 'delete', id: entry.id });
    expect(open).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('kudiumbrowser-open-note', open);
  }
});
