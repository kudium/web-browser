import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { HookEditor } from '../components/UI/HookEditor';

jest.mock('../components/UI/CodeEditor', () => ({
  CodeEditor: ({ label, value }: any) => <textarea aria-label={label} value={value} readOnly />,
}));
jest.mock('../components/UI/HookPresets', () => ({ HookPresets: () => null }));
jest.mock('../components/UI/HookActionsEditor', () => ({ HookActionsEditor: () => <div>Action editor</div> }));

it.each([
  [{ before: '', after: '', css: '' }, 'After load'],
  [{ before: 'run();', after: '', css: '' }, 'Before load'],
  [{ before: '', after: '', css: 'body {}' }, 'CSS'],
  [{ before: 'run();', after: 'run();', css: '' }, 'After load'],
  [{ before: '', after: '', css: '', actions: [{ source: 'run();' }] }, 'Actions (1)'],
])('opens the populated tab or the empty-hook default', (code, label) => {
  render(<Theme><HookEditor code={code as any} disabled={false} onChange={jest.fn()} /></Theme>);
  expect(screen.getByRole('tab', { name: (name) => name.startsWith(label) })).toHaveAttribute('aria-selected', 'true');
});

it('preserves a manual tab choice while editing and selects content when switching hooks', () => {
  const change = jest.fn();
  const view = (key: string, css: string) => (
    <Theme><HookEditor selectionKey={key} code={{ before: '', after: '', css }} disabled={false} onChange={change} /></Theme>
  );
  const rendered = render(view('one', 'body {}'));
  fireEvent.keyDown(screen.getByRole('tab', { name: /Before load/ }), { key: 'Enter' });
  rendered.rerender(view('one', 'body { color: red; }'));
  expect(screen.getByRole('tab', { name: /Before load/ })).toHaveAttribute('aria-selected', 'true');
  rendered.rerender(view('two', 'body {}'));
  expect(screen.getByRole('tab', { name: /CSS/ })).toHaveAttribute('aria-selected', 'true');
});
