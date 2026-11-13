import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { GlobalHookEditorPage } from '../components/View/GlobalHookEditorPage';
beforeAll(() => {
  global.ResizeObserver = jest.fn().mockImplementation(() => ({ observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() }));
});
jest.mock('../components/UI/CodeEditor', () => ({
  CodeEditor: ({ value, onChange, label }: any) => (
    <textarea
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
const hook = {
  id: 'one',
  name: 'Reading',
  enabled: false,
  path: '/*',
  exclusions: [],
  before: '',
  after: '',
  css: '',
};
const state = {
  editorHook: hook,
  destination: { groupName: 'All groups' },
  global: { enabled: true, hooks: [hook] },
  globalHash: 'original',
};
it('edits code in the native window view and saves without enabling the hook', async () => {
  const request = jest.fn(async (input) =>
    input.action === 'state'
      ? state
      : {
          ...state,
          global: input.config,
          editorHook: input.config.hooks[0],
          globalHash: 'saved',
        }
  );
  const command = jest.fn();
  (window as any).electron = {
    hookMarketplace: { request, onTestState: jest.fn(() => () => {}) },
    siteDeveloper: { command },
  };
  render(
    <Theme>
      <GlobalHookEditorPage />
    </Theme>
  );
  await screen.findByLabelText('Name');
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Updated reading' },
  });
  fireEvent.keyDown(await screen.findByRole('tab', { name: /CSS/ }), { key: 'Enter' });
  fireEvent.change(screen.getByLabelText('CSS code'), {
    target: { value: 'p{color:blue}' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save hook' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      action: 'global-save',
      config: {
        enabled: true,
        hooks: [{ ...hook, name: 'Updated reading', css: 'p{color:blue}' }],
      },
      expectedHash: 'original',
    })
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save hook' })).toBeDisabled()
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Expand or restore editor' })
  );
  expect(command).toHaveBeenCalledWith('expand');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(command).toHaveBeenCalledWith('close');
});

it('runs an unsaved draft against a sample URL without saving and displays test output', async () => {
  let publish: (state: any) => void = () => {};
  const request = jest.fn(async (input) =>
    input.action === 'state' ? state : null
  );
  (window as any).electron = {
    hookMarketplace: {
      request,
      onTestState: (callback: any) => {
        publish = callback;
        return () => {};
      },
    },
    siteDeveloper: { command: jest.fn() },
  };
  render(
    <Theme>
      <GlobalHookEditorPage />
    </Theme>
  );
  await screen.findByLabelText('Name');
  fireEvent.change(await screen.findByLabelText('After load code'), {
    target: { value: "log('test')" },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Test hook' }));
  fireEvent.click(screen.getByRole('button', { name: 'Run test' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      action: 'global-test-run',
      url: 'https://example.com',
      hook: { ...hook, after: "log('test')" },
    })
  );
  expect(
    request.mock.calls.some(([input]) => input.action === 'global-save')
  ).toBe(false);
  const { act } = await import('@testing-library/react');
  act(() =>
    publish({
      url: 'https://example.com',
      status: 'success',
      logs: [{ time: 1, level: 'info', message: 'test' }],
    })
  );
  expect(screen.getByText('Test completed')).toBeInTheDocument();
  expect(screen.getByRole('log')).toHaveTextContent('test');
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({ action: 'global-test-stop' })
  );
});

it('loads a saved test website URL and persists edits through the shared field', async () => {
  const savedHook = { ...hook, testUrl: 'https://example.org/sample' };
  const request = jest.fn(async (input) =>
    input.action === 'state'
      ? {
          ...state,
          editorHook: savedHook,
          global: { ...state.global, hooks: [savedHook] },
        }
      : { ...state, global: input.config, editorHook: input.config.hooks[0] }
  );
  (window as any).electron = {
    hookMarketplace: { request, onTestState: () => () => {} },
    siteDeveloper: { command: jest.fn() },
  };
  render(
    <Theme>
      <GlobalHookEditorPage />
    </Theme>
  );
  await screen.findByLabelText('Name');
  fireEvent.click(screen.getByRole('button', { name: 'Test hook' }));
  expect(screen.getByLabelText('Test website URL')).toHaveValue(
    'https://example.org/sample'
  );
  fireEvent.change(screen.getByLabelText('Test website URL'), {
    target: { value: 'https://example.org/new' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save hook' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'global-save',
        config: {
          enabled: true,
          hooks: [{ ...hook, testUrl: 'https://example.org/new' }],
        },
      })
    )
  );
});

it('creates and saves an actions-only hook using the shared editor', async () => {
  const request = jest.fn(async (input) => input.action === 'state' ? state : { ...state, global: input.config, editorHook: input.config.hooks[0], globalHash: 'saved' });
  (window as any).electron = { hookMarketplace: {request,onTestState:jest.fn(() => () => {})}, siteDeveloper:{command:jest.fn()} };
  render(<Theme><GlobalHookEditorPage /></Theme>);
  await screen.findByLabelText('After load code');
  const tab = screen.getByRole('tab', {name:/Actions/});
  fireEvent.keyDown(tab, {key:'Enter'});
  fireEvent.keyDown(screen.getByRole('button', {name:'Examples'}), {key:'ArrowDown'});
  fireEvent.click(await screen.findByRole('menuitem', {name:'Generate password'}));
  fireEvent.click(screen.getByRole('button', {name:'Save hook'}));
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action:'global-save', config:expect.objectContaining({hooks:[expect.objectContaining({actions:[expect.objectContaining({name:'Generate password',contexts:['password']})],before:'',after:'',css:''})]}) })));
  await waitFor(() => expect(screen.getByRole('button', {name:'Publish'})).toBeEnabled());
});
