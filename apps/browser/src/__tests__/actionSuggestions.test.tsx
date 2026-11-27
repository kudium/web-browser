import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActionSuggestions } from '../components/UI/ActionSuggestions';
import type { TodoEntry } from '../browser/todos';
let entries: TodoEntry[] = [];
jest.mock('../components/UI/useTodoEntries', () => ({
  useTodoEntries: () => ({ entries, day: '2026-11-26', error: '' }),
}));
jest.mock('../components/UI/BrowserRecommendations', () => ({
  BrowserRecommendations: () => <div>Discover fallback</div>,
}));
const request = jest.fn();
beforeEach(() => {
  entries = [
    {
      id: 'a',
      title: 'First',
      noteId: 'list',
      noteTitle: 'Tasks',
      today: '2026-11-26',
    },
    {
      id: 'b',
      title: 'Second',
      noteId: 'list',
      noteTitle: 'Tasks',
      today: '2026-11-26',
    },
  ];
  request.mockReset().mockResolvedValue([]);
  Object.assign(window, {
    electron: {
      passwordManager: request,
      siteDeveloper: { onSuggestionsChanged: () => () => {} },
    },
  });
});
test('Next rotates without completing and incoming tasks join behind the current item', async () => {
  const view = render(<ActionSuggestions onMarketplace={() => true} />);
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(screen.getByRole('button', {name:'Choose queued action'}).closest('.recommendation-card')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Second')).toBeInTheDocument();
  entries = [
    ...entries,
    {
      id: 'c',
      title: 'New incoming',
      noteId: 'list',
      noteTitle: 'Tasks',
      today: '2026-11-26',
    },
  ];
  view.rerender(<ActionSuggestions onMarketplace={() => true} />);
  expect(screen.getByText('Second')).toBeInTheDocument();
  expect(request).not.toHaveBeenCalledWith(
    expect.objectContaining({ action: 'todoChange' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('First')).toBeInTheDocument();
});
test('completion advances immediately without a status card and clicking opens its owning note', async () => {
  const open = jest.fn();
  window.addEventListener('kudiumbrowser-open-note', open);
  const view = render(<ActionSuggestions onMarketplace={() => true} />);
  fireEvent.click(screen.getByRole('button', { name: 'First' }));
  expect(open).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Second' })).toBeInTheDocument(),
  );
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'todoChange',
      id: 'list',
      taskId: 'a',
      change: 'complete',
    }),
  );
  entries = [];
  view.rerender(<ActionSuggestions onMarketplace={() => true} />);
  expect(screen.queryByText('Task completed')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name:'Undo'})).not.toBeInTheDocument();
  expect(screen.getByText('Discover fallback')).toBeInTheDocument();
  window.removeEventListener('kudiumbrowser-open-note', open);
});

test('future scheduled tasks stay out of suggestions until their scheduled day', async () => {
  entries = [{ ...entries[0], today:'2026-11-27' }];
  const view = render(<ActionSuggestions onMarketplace={() => true} />);
  expect(screen.getByText('Discover fallback')).toBeInTheDocument();
  entries = [{ ...entries[0], today:'2026-11-26' }];
  view.rerender(<ActionSuggestions onMarketplace={() => true} />);
  expect(screen.getByRole('button', {name:'First'})).toBeInTheDocument();
});

test('shows labeled contact and web CTAs inside the card without completing the task', () => {
  entries = [{...entries[0],title:'My Email : samsoin@kfna.com; Phone: +14165550123; https://example.com'}];
  render(<ActionSuggestions onMarketplace={() => true} />);
  const mail = screen.getByRole('link',{name:'My Email: samsoin@kfna.com'});
  expect(mail).toHaveAttribute('href','mailto:samsoin@kfna.com');
  expect(mail.closest('.recommendation-card')).not.toBeNull();
  expect(screen.getByRole('link',{name:'Phone: +14165550123'})).toHaveAttribute('href','tel:+14165550123');
  expect(screen.getByRole('button',{name:'More task links'})).toBeInTheDocument();
  expect(request).not.toHaveBeenCalledWith(expect.objectContaining({action:'todoChange'}));
});

test('Next hides when only one task remains and returns when another arrives', () => {
  const view = render(<ActionSuggestions onMarketplace={() => true} />);
  expect(screen.getByRole('button',{name:'Next'})).toBeInTheDocument();
  entries = [entries[0]];
  view.rerender(<ActionSuggestions onMarketplace={() => true} />);
  expect(screen.queryByRole('button',{name:'Next'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Choose queued action'})).not.toBeInTheDocument();
  entries = [...entries,{...entries[0],id:'new',title:'New task'}];
  view.rerender(<ActionSuggestions onMarketplace={() => true} />);
  expect(screen.getByRole('button',{name:'Next'})).toBeInTheDocument();
});
