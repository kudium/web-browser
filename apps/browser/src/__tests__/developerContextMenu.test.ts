import { showDeveloperContextMenu } from '../components/UI/developerContextMenu';
const nativeMenu = jest.fn();
beforeEach(() => {
  nativeMenu.mockReset();
  Object.assign(window, { electron: { browser: { nativeMenu } } });
});
it('runs the chosen enabled action and leaves disabled or stale actions untouched', async () => {
  const run = jest.fn();
  const error = jest.fn();
  nativeMenu.mockResolvedValue('0');
  await showDeveloperContextMenu([{ label: 'Copy', run }], () => true, error);
  expect(run).toHaveBeenCalledTimes(1);
  await showDeveloperContextMenu(
    [{ label: 'Paste', disabled: true, run }],
    () => true,
    error
  );
  await showDeveloperContextMenu(
    [{ label: 'Rename', run }],
    () => false,
    error
  );
  expect(run).toHaveBeenCalledTimes(1);
  expect(error).not.toHaveBeenCalled();
});
it('reports command failures without offering unrelated browser actions', async () => {
  const error = jest.fn();
  nativeMenu.mockResolvedValue('0');
  await showDeveloperContextMenu(
    [
      {
        label: 'Save file',
        run: async () => {
          throw Error('Permission denied');
        },
      },
    ],
    () => true,
    error
  );
  expect(error).toHaveBeenCalledWith('Permission denied');
  expect(nativeMenu.mock.calls[0][0]).toEqual([
    { id: '0', label: 'Save file', enabled: true },
  ]);
});

it('routes the configured Run as submenu action', async () => {
  const run = jest.fn();
  nativeMenu.mockResolvedValue('0.0');
  await showDeveloperContextMenu(
    [{ label: 'Run as', submenu: [{ label: 'Development', run }] }],
    () => true,
    jest.fn()
  );
  expect(nativeMenu.mock.calls[0][0][0].submenu[0].label).toBe('Development');
  expect(run).toHaveBeenCalledTimes(1);
});
