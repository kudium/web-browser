import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { DeveloperProjectSection } from '../components/UI/DeveloperProjectSection';

const linked = {
  name: 'Example',
  path: '/workspace/example',
  available: true,
  repository: 'https://github.com/example/project',
};
const project = jest.fn();
const editors = jest.fn().mockResolvedValue({
  editors: [{ id: '/Applications/WebStorm.app', name: 'WebStorm' }],
  preferred: '/Applications/WebStorm.app',
});
beforeAll(() => {
  Object.assign(window, {
    PointerEvent: MouseEvent,
    ResizeObserver: class {
      observe = jest.fn();

      unobserve = jest.fn();

      disconnect = jest.fn();
    },
  });
  Object.assign(HTMLElement.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: jest.fn(),
    releasePointerCapture: jest.fn(),
    scrollIntoView: jest.fn(),
  });
});
beforeEach(() => {
  jest.clearAllMocks();
  project.mockReset();
  Object.assign(window, { electron: { siteDeveloper: { project, editors } } });
});
it('links on demand, opens the project terminal and displays actionable errors', async () => {
  project.mockResolvedValue(null);
  render(
    <Theme>
      <DeveloperProjectSection sourceId="one" active />
    </Theme>
  );
  await screen.findByRole('button', { name: 'Link folder' });
  project.mockResolvedValue(linked);
  fireEvent.click(screen.getByRole('button', { name: 'Link folder' }));
  await screen.findByRole('button', { name: 'Terminal' });
  expect(project).toHaveBeenCalledWith('one', 'link', undefined);
  project.mockRejectedValueOnce(
    new Error(
      "Error invoking remote method 'site-developer-project': Error: Terminal is unavailable."
    )
  );
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Terminal' }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Open system terminal' })
  );
  await screen.findByRole('alert');
  expect(project).toHaveBeenCalledWith('one', 'terminal', undefined);
  expect(screen.getByRole('alert').textContent).toBe(
    'Terminal is unavailable.'
  );
});
it('does not reveal a previous group when a request finishes after switching groups', async () => {
  let finish: (value: typeof linked) => void = () => {};
  project
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValue(null);
  const view = render(
    <Theme>
      <DeveloperProjectSection sourceId="one" active />
    </Theme>
  );
  view.rerender(
    <Theme>
      <DeveloperProjectSection sourceId="two" active />
    </Theme>
  );
  await screen.findByRole('button', { name: 'Link folder' });
  await act(async () => finish(linked));
  await waitFor(() => expect(screen.queryByText('Example')).toBeNull());
});
it('lists installed editors and opens the chosen editor instead of assuming VS Code', async () => {
  project.mockResolvedValue(linked);
  render(
    <Theme>
      <DeveloperProjectSection sourceId="one" active />
    </Theme>
  );
  const button = await screen.findByRole('button', { name: 'Editor' });
  fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
  fireEvent.click(
    await screen.findByRole('menuitemcheckbox', { name: 'WebStorm' })
  );
  await waitFor(() =>
    expect(project).toHaveBeenCalledWith(
      'one',
      'editor',
      '/Applications/WebStorm.app'
    )
  );
});
it('offers an embedded terminal without launching an external app', async () => {
  project.mockResolvedValue(linked);
  const open = jest.fn();
  render(
    <Theme>
      <DeveloperProjectSection sourceId="one" active onOpenTerminal={open} />
    </Theme>
  );
  const button = await screen.findByRole('button', { name: 'Terminal' });
  fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Open here' }));
  expect(open).toHaveBeenCalledTimes(1);
  expect(project).not.toHaveBeenCalledWith('one', 'terminal', undefined);
});
it('opens Files on demand, toggles through the Files tab and resets browsing after changing groups', async () => {
  project.mockResolvedValue(linked);
  const files = jest.fn().mockResolvedValue({ path: '', entries: [] });
  Object.assign(window.electron.siteDeveloper, { files });
  const rendered = render(
    <Theme>
      <DeveloperProjectSection sourceId="one" active />
    </Theme>
  );
  const action = await screen.findByRole('button', { name: 'Files' });
  expect(files).not.toHaveBeenCalled();
  fireEvent.click(action);
  await screen.findByRole('region', { name: 'Project files' });
  expect(files).toHaveBeenCalledWith('one', {
    action: 'list',
    path: '',
    hidden: false,
  });
  expect(screen.queryByRole('button', { name: 'Close files' })).toBeNull();
  fireEvent.click(action);
  expect(screen.queryByRole('region', { name: 'Project files' })).toBeNull();
  fireEvent.click(action);
  await screen.findByRole('region', { name: 'Project files' });
  rendered.rerender(
    <Theme>
      <DeveloperProjectSection sourceId="two" active />
    </Theme>
  );
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Project files' })).toBeNull()
  );
});

it('shows the already-linked folder in group settings and opens Developer without workspace controls', async () => {
  project.mockResolvedValue(linked);
  const open = jest.fn();
  const submitted = jest.fn();
  render(
    <Theme>
      <form onSubmit={submitted}>
        <DeveloperProjectSection
          sourceId="one"
          active
          settingsOnly
          onOpenDeveloper={open}
        />
      </form>
    </Theme>
  );
  await screen.findByText('Example');
  expect(
    screen.getByRole('navigation', { name: 'Project directory' }).title
  ).toBe(linked.path);
  expect(screen.queryByRole('button', { name: 'Files' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Terminal' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open Developer' }));
  expect(open).toHaveBeenCalledTimes(1);
  expect(submitted).not.toHaveBeenCalled();
});

it('links a project directly from group settings and displays the resulting folder', async () => {
  project.mockResolvedValue(null);
  const submitted = jest.fn();
  render(
    <Theme>
      <form onSubmit={submitted}>
        <DeveloperProjectSection sourceId="one" active settingsOnly />
      </form>
    </Theme>
  );
  await screen.findByRole('button', { name: 'Link folder' });
  project.mockResolvedValue(linked);
  fireEvent.click(screen.getByRole('button', { name: 'Link folder' }));
  await screen.findByText('Example');
  expect(project).toHaveBeenCalledWith('one', 'link', undefined);
  expect(submitted).not.toHaveBeenCalled();
});

it('picks up a project linked elsewhere without waiting for window focus', async () => {
  let changed = () => {};
  Object.assign(window.electron.siteDeveloper, {
    onPagesChanged: (listener: () => void) => {
      changed = listener;
      return () => {};
    },
  });
  project.mockResolvedValue(null);
  render(
    <Theme>
      <DeveloperProjectSection sourceId="one" active />
    </Theme>
  );
  await screen.findByRole('button', { name: 'Link folder' });
  project.mockResolvedValue(linked);
  act(() => changed());
  await screen.findByText('Example');
  expect(screen.queryByRole('button', { name: 'Link folder' })).toBeNull();
});
