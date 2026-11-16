import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { NotesPage } from '../components/UI/NotesPage';

jest.mock('../browser/client', () => ({ browser: { nativeMenu: jest.fn() } }));
jest.mock('../components/UI/MarkdownNoteEditor', () => {
  throw Object.assign(new Error('Loading chunk 571 failed'), {
    name: 'ChunkLoadError',
  });
});

it('keeps the note draft available when the lazy editor fails', async () => {
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
  const item = {
    id: 'one',
    title: 'Draft',
    kind: 'note',
    notes: 'Preserve this draft',
    fields: [],
  };
  const request = jest.fn(async ({ action }) =>
    action === 'notes' ? [item] : action === 'edit' ? item : {}
  );
  Object.assign(window, {
    electron: {
      passwordManager: request,
      onPasswordManagerLock: () => () => {},
    },
  });
  try {
    render(
      <Theme>
        <NotesPage />
      </Theme>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Draft' }));
    expect(
      await screen.findByText('Note editor could not be displayed')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Part of the browser could not load/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use plain text' }));
    expect(
      await screen.findByRole('textbox', { name: 'Note Markdown source' })
    ).toHaveValue('Preserve this draft');
  } finally {
    quiet.mockRestore();
  }
});
