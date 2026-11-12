import { renderHook, waitFor } from '@testing-library/react';
import { useProjectFileSuggestions } from '../utils/hooks/useProjectFileSuggestions';

const files = jest.fn();
beforeEach(() => {
  files.mockReset();
  Object.assign(window, { electron: { siteDeveloper: { files } } });
});

it('lists nested file names, narrows paths, and skips dependencies without reading contents', async () => {
  files.mockImplementation(async (_id, request) => ({
    entries:
      request.path === 'src'
        ? [{ kind: 'file', name: 'home.html', path: 'src/home.html' }]
        : [
            { kind: 'file', name: 'README.md', path: 'README.md' },
            { kind: 'folder', name: 'src', path: 'src' },
            { kind: 'folder', name: 'node_modules', path: 'node_modules' },
          ],
  }));
  const { result, rerender } = renderHook(
    ({ query }) => useProjectFileSuggestions('tab', query),
    { initialProps: { query: '' } }
  );
  await waitFor(() =>
    expect(
      result.current.entries.some((file) => file.path === 'src/home.html')
    ).toBe(true)
  );
  rerender({ query: 'home' });
  expect(result.current.entries.map((file) => file.path)).toEqual([
    'src/home.html',
  ]);
  expect(
    files.mock.calls.every(([, request]) => request.action === 'list')
  ).toBe(true);
  expect(
    files.mock.calls.some(([, request]) => request.path === 'node_modules')
  ).toBe(false);
  rerender({ query: 'src/' });
  await waitFor(() =>
    expect(result.current.entries.map((file) => file.path)).toEqual([
      'src/home.html',
    ])
  );
});

it('does not browse files until the slash picker is opened', async () => {
  const { result } = renderHook(() =>
    useProjectFileSuggestions('tab', undefined)
  );
  expect(result.current.entries).toEqual([]);
  expect(files).not.toHaveBeenCalled();
});

it('drops results when switching to another group', async () => {
  files.mockImplementation(async (id) => ({
    entries: [{ kind: 'file', name: `${id}.txt`, path: `${id}.txt` }],
  }));
  const { result, rerender } = renderHook(
    ({ id }) => useProjectFileSuggestions(id, ''),
    { initialProps: { id: 'first' } }
  );
  await waitFor(() =>
    expect(result.current.entries[0]?.path).toBe('first.txt')
  );
  rerender({ id: 'second' });
  expect(result.current.entries).toEqual([]);
  await waitFor(() =>
    expect(result.current.entries[0]?.path).toBe('second.txt')
  );
});
