import { act, renderHook, waitFor } from '@testing-library/react';
import { useAppTheme } from '../utils/spaceTheme';
import { resolveAppTheme, type AppTheme } from '../utils/appTheme';
const space = {
  id: 'work',
  name: 'Work',
  folders: [],
  color: 'iris' as const,
  useWebsiteColors: true,
};
it('Preferences uses its browser theme and receives live website and space changes', async () => {
  window.history.replaceState({}, '', '/?view=settings');
  let changed: (theme: AppTheme | undefined) => void = () => {};
  const inherited = resolveAppTheme(space, '#4285f4');
  const off = jest.fn();
  (window as any).electron = {
    appTheme: {
      get: async () => inherited,
      onChanged: (callback: any) => {
        changed = callback;
        return off;
      },
    },
  };
  const { result, unmount } = renderHook(() =>
    useAppTheme({ ...space, id: 'other-renderer-space' })
  );
  await waitFor(() => expect(result.current).toEqual(inherited));
  const next = resolveAppTheme(
    { ...space, id: 'new-space', frameColor: '#123456' },
    '#ff0000'
  );
  act(() => changed(next));
  expect(result.current).toEqual(next);
  unmount();
  expect(off).toHaveBeenCalled();
});
it('publishes the resolved browser color and ignores a page color from an inactive space', async () => {
  window.history.replaceState({}, '', '/?view=main');
  const publish = jest.fn(async () => undefined);
  (window as any).electron = { appTheme: { publish } };
  const { result, rerender } = renderHook(
    ({ page }) => useAppTheme(space, page),
    { initialProps: { page: { spaceId: 'work', color: '#4285f4' } } }
  );
  expect(result.current.primary).toBe('#4285f4');
  expect(publish).toHaveBeenLastCalledWith(resolveAppTheme(space, '#4285f4'));
  rerender({ page: { spaceId: 'inactive', color: '#ff0000' } });
  expect(result.current.primary).toBe('#5aaca8');
});
