import '@testing-library/jest-dom';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { HookActionsEditor } from '../components/UI/HookActionsEditor';
// eslint-disable-next-line import/no-relative-packages
import {
  actionTemplates,
  type HookAction,
} from '../../../../packages/hooks/actions';
jest.mock('../components/UI/CodeEditor', () => ({
  CodeEditor: ({ value, onChange, label }: any) => (
    <textarea
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
function Fixture() {
  const [actions, setActions] = useState<HookAction[]>(
    ['Explain selection','Summarize page'].map(name => actionTemplates.find(a => a.name === name)!).map((a, i) => ({ ...a, id: `action${i}` }))
  );
  return (
    <Theme>
      <HookActionsEditor
        actions={actions}
        disabled={false}
        onChange={setActions}
      />
    </Theme>
  );
}
it('mounts one handler, preserves drafts across selection, and keeps at least one context', () => {
  render(<Fixture />);
  expect(
    screen.queryByRole('button', { name: /Permissions/ })
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole('textbox')).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('Explain selection handler'), {
    target: { value: 'return "My draft";' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Summarize page Page/ }));
  expect(
    screen.queryByLabelText('Explain selection handler')
  ).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Page' })).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: /Explain selection Selection/ })
  );
  expect(screen.getByLabelText('Explain selection handler')).toHaveValue(
    'return "My draft";'
  );
});
it('selects a newly added action and falls back after deleting it', () => {
  render(<Fixture />);
  fireEvent.click(screen.getByRole('button', { name: 'Add action' }));
  expect(screen.getByLabelText('Menu label')).toHaveValue('New action');
  fireEvent.change(screen.getByLabelText('Menu label'), {
    target: { value: 'My action' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Delete My action' }));
  expect(screen.getByLabelText('Menu label')).toHaveValue('Explain selection');
  expect(screen.getAllByRole('textbox')).toHaveLength(2);
});

it('places examples with a dropdown caret above the Actions fields',()=>{
  render(<Fixture />);
  const tools=screen.getByRole('group',{name:'Action tools'});
  expect(tools.parentElement).toHaveClass('hook-actions-editor');
  expect(tools.closest('.hook-editor-canvas')).toBeNull();
  expect(tools).toContainElement(screen.getByRole('button',{name:'Examples'}));
  expect(screen.getByRole('button',{name:'Examples'}).querySelector('svg')).toHaveAttribute('aria-hidden','true');
});

it('defaults new actions and the first example to Page',()=>{
  expect(actionTemplates[0].contexts).toEqual(['page']);
  render(<Fixture />);
  fireEvent.click(screen.getByRole('button',{name:'Add action'}));
  expect(screen.getByRole('checkbox',{name:'Page'})).toBeChecked();
  expect(screen.getByRole('checkbox',{name:'Selection'})).not.toBeChecked();
});
