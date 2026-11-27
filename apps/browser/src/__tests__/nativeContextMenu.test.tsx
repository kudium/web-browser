import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NativeContextMenu as Menu } from '../components/UI/NativeContextMenu';
import { browser } from '../browser/client';

jest.mock('../browser/client', () => ({ browser: { nativeMenu: jest.fn() } }));
it('gives items without callbacks independent IDs instead of selecting another action', async () => {
  const action = jest.fn();
  (browser.nativeMenu as jest.Mock)
    .mockResolvedValueOnce('0')
    .mockResolvedValueOnce('1');
  render(
    <Menu.Root>
      <Menu.Trigger>
        <button type="button">Menu</button>
      </Menu.Trigger>
      <Menu.Content>
        <Menu.Item>Plain item</Menu.Item>
        <Menu.Item onSelect={action}>Action</Menu.Item>
      </Menu.Content>
    </Menu.Root>
  );
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Menu' }));
  await waitFor(() =>
    expect(browser.nativeMenu).toHaveBeenCalledWith([
      { id: '0', label: 'Plain item', enabled: true },
      { id: '1', label: 'Action', enabled: true },
    ])
  );
  expect(action).not.toHaveBeenCalled();
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Menu' }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
});

it('opens the same actions from the options button and right click without toggling the folder', async () => {
  const toggle = jest.fn();
  const pin = jest.fn();
  (browser.nativeMenu as jest.Mock).mockClear().mockResolvedValue('0');
  render(
    <Menu.Root>
      <Menu.Trigger>
        <button type="button" onClick={toggle}>
          Folder
        </button>
        <Menu.OptionsTrigger>Folder options</Menu.OptionsTrigger>
      </Menu.Trigger>
      <Menu.Content>
        <Menu.Item onSelect={pin}>Pin folder</Menu.Item>
      </Menu.Content>
    </Menu.Root>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Folder options' }));
  await waitFor(() => expect(pin).toHaveBeenCalledTimes(1));
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Folder' }));
  await waitFor(() => expect(pin).toHaveBeenCalledTimes(2));
  expect(toggle).not.toHaveBeenCalled();
  expect((browser.nativeMenu as jest.Mock).mock.calls[0]).toEqual(
    (browser.nativeMenu as jest.Mock).mock.calls[1]
  );
});

it('supports shared menus opened by delegated elements and drops stale selections', async () => {
  const { showNativeContextMenu } = await import(
    '../components/UI/NativeContextMenu'
  );
  const action = jest.fn();
  (browser.nativeMenu as jest.Mock).mockResolvedValue('0');
  const content = (
    <Menu.Content>
      <Menu.Item onSelect={action}>Shared action</Menu.Item>
    </Menu.Content>
  );
  await showNativeContextMenu(content, () => false);
  expect(action).not.toHaveBeenCalled();
  await showNativeContextMenu(content, () => true);
  expect(action).toHaveBeenCalledTimes(1);
});

it('builds lazy menus only on request and uses the current render state', async () => {
  const action = jest.fn();
  const factory = jest.fn(() => <Menu.Content><Menu.Item onSelect={action}>Current action</Menu.Item></Menu.Content>);
  (browser.nativeMenu as jest.Mock).mockClear().mockResolvedValue('0');
  const view = render(<Menu.Root menu={factory}><Menu.Trigger><button>Lazy menu</button></Menu.Trigger></Menu.Root>);
  expect(factory).not.toHaveBeenCalled();
  view.rerender(<Menu.Root menu={factory}><Menu.Trigger><button>Lazy menu</button></Menu.Trigger></Menu.Root>);
  expect(factory).not.toHaveBeenCalled();
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Lazy menu' }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(factory).toHaveBeenCalledTimes(1);
});

it('ignores a native-menu selection after its row has been removed', async () => {
  let resolve!: (id: string) => void;
  const action = jest.fn();
  (browser.nativeMenu as jest.Mock).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const view = render(<Menu.Root menu={() => <Menu.Item onSelect={action}>Action</Menu.Item>}><button>Remove me</button></Menu.Root>);
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Remove me' }));
  view.unmount(); resolve('0');
  await Promise.resolve();
  expect(action).not.toHaveBeenCalled();
});
