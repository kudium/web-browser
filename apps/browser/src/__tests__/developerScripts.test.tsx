import { useState, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { PanelOverlayProvider } from '../components/UI/PanelDialog';
import { DeveloperScripts } from '../components/UI/DeveloperScripts';

const local = {
  id: 'local',
  name: 'Dev server',
  command: 'npm run dev',
  scope: 'project',
};
const global = {
  id: 'global',
  name: 'Install',
  command: 'npm install',
  scope: 'global',
};
const scripts = jest.fn();
const show = jest.fn();
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
  scripts.mockReset().mockResolvedValue({ scripts: [local, global] });
  Object.assign(window, { electron: { siteDeveloper: { scripts } } });
});
const openMenu = () =>
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Scripts' }), {
    button: 0,
    ctrlKey: false,
  });
async function add() {
  render(
    <Theme>
      <DeveloperScripts sourceId="tab" disabled={false} onRun={show} />
    </Theme>
  );
  openMenu();
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Manage scripts…' })
  );
  const button = await screen.findByRole('button', { name: 'Add script' });
  await waitFor(() => expect(button.getAttribute('disabled')).toBeNull());
  fireEvent.click(button);
  fireEvent.change(screen.getByRole('textbox', { name: 'Script name' }), {
    target: { value: 'Tests' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Script command' }), {
    target: { value: 'npm test' },
  });
}
it('runs a selected saved command by identity and reveals the terminal', async () => {
  render(
    <Theme>
      <DeveloperScripts sourceId="tab" disabled={false} onRun={show} />
    </Theme>
  );
  openMenu();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Dev server' }));
  await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
  expect(scripts).toHaveBeenCalledWith('tab', { action: 'run', id: 'local' });
});
it('saves an all-projects command and immediately runs the saved identity', async () => {
  await add();
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Script scope' }), {
    key: 'ArrowDown',
  });
  fireEvent.click(await screen.findByRole('option', { name: 'All projects' }));
  const saved = {
    id: 'saved',
    name: 'Tests',
    command: 'npm test',
    scope: 'global',
  };
  scripts.mockResolvedValue({ scripts: [local, global, saved] });
  fireEvent.click(screen.getByRole('button', { name: 'Save & run' }));
  await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
  expect(scripts).toHaveBeenCalledWith('tab', {
    action: 'save',
    id: undefined,
    name: 'Tests',
    command: 'npm test',
    scope: 'global',
  });
  expect(scripts).toHaveBeenCalledWith('tab', { action: 'run', id: 'saved' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('retains an unsaved command and reports save failure without executing it', async () => {
  await add();
  scripts.mockRejectedValueOnce(new Error('Could not save scripts.'));
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  await screen.findByRole('alert');
  expect(
    (
      screen.getByRole('textbox', {
        name: 'Script command',
      }) as HTMLInputElement
    ).value
  ).toBe('npm test');
  expect(show).not.toHaveBeenCalled();
  expect(scripts).not.toHaveBeenCalledWith(
    'tab',
    expect.objectContaining({ action: 'run' })
  );
});

function ScopedPanel({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return (
    <Theme>
      <PanelOverlayProvider container={container}>
        <aside className="ai-sidebar">
          {children}
          <div data-testid="panel-layer" ref={setContainer} />
        </aside>
      </PanelOverlayProvider>
    </Theme>
  );
}
it('keeps Manage Scripts and its scope picker in the panel portal', async () => {
  render(
    <ScopedPanel>
      <DeveloperScripts sourceId="tab" disabled={false} />
    </ScopedPanel>
  );
  openMenu();
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Manage scripts…' })
  );
  const dialog = await screen.findByRole('dialog');
  const layer = screen.getByTestId('panel-layer');
  expect(layer.contains(dialog)).toBe(true);
  const addButton = await screen.findByRole('button', { name: 'Add script' });
  await waitFor(() => expect(addButton.getAttribute('disabled')).toBeNull());
  fireEvent.click(addButton);
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Script scope' }), {
    key: 'ArrowDown',
  });
  expect(layer.contains(await screen.findByRole('listbox'))).toBe(true);
  fireEvent.click(await screen.findByRole('option', { name: 'All projects' }));
  expect(
    screen.getByRole('combobox', { name: 'Script scope' }).textContent
  ).toContain('All projects');
});

it.each([
  ['Node.js', 'Development server npm run dev', 'npm run dev'],
  ['Bun', 'Development server bun run dev', 'bun run dev'],
  [
    'Python',
    'HTTP server python3 -m http.server 8000',
    'python3 -m http.server 8000',
  ],
  ['PHP', 'Laravel server php artisan serve', 'php artisan serve'],
  ['Rust', 'Tests cargo test', 'cargo test'],
  ['Go', 'Run go run .', 'go run .'],
])(
  'inserts an editable %s command without saving or running',
  async (language, label, command) => {
    await add();
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Suggest a script command' }),
      { button: 0, ctrlKey: false }
    );
    const category = await screen.findByRole('menuitem', { name: language });
    fireEvent.click(category);
    fireEvent.click(await screen.findByRole('menuitem', { name: label }));
    const input = screen.getByRole('textbox', {
      name: 'Script command',
    }) as HTMLInputElement;
    expect(input.value).toBe(command);
    expect(
      (screen.getByRole('textbox', { name: 'Script name' }) as HTMLInputElement)
        .value
    ).toBe('Tests');
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(
      scripts.mock.calls.some(([, request]) =>
        ['save', 'run'].includes(request.action)
      )
    ).toBe(false);
    fireEvent.change(input, { target: { value: `${command} --help` } });
    expect(input.value).toBe(`${command} --help`);
  }
);
