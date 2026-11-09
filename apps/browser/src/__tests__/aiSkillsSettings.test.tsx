import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { AISkillsSettings } from '../components/View/Settings/AISkillsSettings';

Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })),
});
const skill = {
  id: 'pdf',
  name: 'PDF workflow',
  description: 'Edit attachments.',
  enabled: false,
  instructions: 'Preview before uploading.',
  resources: { 'scripts/edit.py': 'print("reference only")' },
};
it('adds disabled skills, previews text, enables explicitly and confirms removal', async () => {
  const api = jest
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([skill])
    .mockResolvedValueOnce([{ ...skill, enabled: true }])
    .mockResolvedValueOnce([]);
  Object.assign(window, { electron: { ai: { skills: api } } });
  render(
    <Theme>
      <AISkillsSettings />
    </Theme>
  );
  await screen.findByText('Drop a skill here');
  fireEvent.keyDown(screen.getByRole('button', { name: 'Add skill' }), {
    key: 'Enter',
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Import folder…' }));
  await screen.findByRole('heading', { name: 'PDF workflow' });
  expect(screen.getByRole('switch')).not.toBeChecked();
  expect(
    screen.getByRole('textbox', { name: 'PDF workflow instructions' })
  ).toHaveTextContent('Preview before uploading');
  fireEvent.click(screen.getByRole('switch'));
  await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());
  fireEvent.click(screen.getByRole('button', { name: 'Remove PDF workflow' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent(
    'original skill folder is kept'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(api).toHaveBeenCalledTimes(3);
  fireEvent.click(screen.getByRole('button', { name: 'Remove PDF workflow' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove skill' }));
  await screen.findByText('Drop a skill here');
  expect(api).toHaveBeenLastCalledWith({ action: 'remove', id: 'pdf' });
});
it('shows retryable errors rather than pretending the skill was saved', async () => {
  const api = jest
    .fn()
    .mockRejectedValueOnce(new Error('Library unavailable'))
    .mockResolvedValueOnce([]);
  Object.assign(window, { electron: { ai: { skills: api } } });
  render(
    <Theme>
      <AISkillsSettings />
    </Theme>
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Library unavailable'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Drop a skill here');
});
it('keeps explanatory text in a hint and supports link installation and creation', async () => {
  const api = jest.fn().mockResolvedValue([]);
  Object.assign(window, { electron: { ai: { skills: api } } });
  render(
    <Theme>
      <AISkillsSettings />
    </Theme>
  );
  await screen.findByText('Drop a skill here');
  expect(
    screen.queryByText(/Existing permissions apply/)
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'About Skills' }));
  expect(screen.getByText(/Existing permissions apply/)).toBeVisible();
  fireEvent.keyDown(screen.getByText(/Existing permissions apply/), {
    key: 'Escape',
  });
  fireEvent.keyDown(screen.getByRole('button', { name: 'Add skill' }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'From link…' }));
  fireEvent.change(screen.getByLabelText('Skill link'), {
    target: { value: 'https://example.com/SKILL.md' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Install skill' }));
  await waitFor(() =>
    expect(api).toHaveBeenLastCalledWith({
      action: 'import-link',
      source: 'https://example.com/SKILL.md',
    })
  );
  await waitFor(() =>
    expect(screen.queryByText('Install from link')).not.toBeInTheDocument()
  );
  fireEvent.keyDown(screen.getByRole('button', { name: 'Add skill' }), {
    key: 'Enter',
  });
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Create skill…' })
  );
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Review' },
  });
  fireEvent.change(screen.getByLabelText('Instructions'), {
    target: { value: 'Read only the relevant files.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create skill' }));
  await waitFor(() =>
    expect(api).toHaveBeenLastCalledWith({
      action: 'create',
      name: 'Review',
      description: '',
      instructions: 'Read only the relevant files.',
    })
  );
});
it('imports dropped local files through the preload file bridge', async () => {
  const api = jest.fn().mockResolvedValue([]);
  const drop = jest.fn().mockResolvedValue([skill]);
  Object.assign(window, {
    electron: { ai: { skills: api, skillsFromDrop: drop } },
  });
  render(
    <Theme>
      <AISkillsSettings />
    </Theme>
  );
  await screen.findByText('Drop a skill here');
  const file = new File(['Instructions'], 'SKILL.md', {
    type: 'text/markdown',
  });
  fireEvent.drop(screen.getByRole('region', { name: 'Skills library' }), {
    dataTransfer: { files: [file] },
  });
  await screen.findByRole('heading', { name: 'PDF workflow' });
  expect(drop).toHaveBeenCalledWith(file);
});
it('edits the selected skill and keeps the draft after a failed save', async () => {
  const api = jest
    .fn()
    .mockResolvedValueOnce([skill])
    .mockRejectedValueOnce(new Error('Save failed'))
    .mockResolvedValueOnce([
      { ...skill, name: 'Reply', instructions: 'Reply clearly.' },
    ]);
  Object.assign(window, { electron: { ai: { skills: api } } });
  render(
    <Theme>
      <AISkillsSettings />
    </Theme>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Skill' }));
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Reply' },
  });
  fireEvent.change(screen.getByLabelText('Instructions'), {
    target: { value: 'Reply clearly.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
  expect(screen.getByLabelText('Name')).toHaveValue('Reply');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('heading', { name: 'Reply' });
  expect(api).toHaveBeenLastCalledWith({
    action: 'update',
    id: 'pdf',
    name: 'Reply',
    description: skill.description,
    instructions: 'Reply clearly.',
  });
});
