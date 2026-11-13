import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { AIThinkingSlider } from '../components/UI/AIThinkingSlider';

it('shows a context control even when the provider has no thinking levels', async () => {
  const change = jest.fn().mockResolvedValue(undefined);
  render(
    <Theme>
      <AIThinkingSlider
        options={[{ id: 'auto', name: 'Thinking: Auto' }]}
        value="auto"
        disabled={false}
        onChange={jest.fn()}
        contextManagement
        onContextManagementChange={change}
      />
    </Theme>
  );
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  const control = screen.getByRole('switch', { name: 'Manage context window' });
  expect(control).toBeChecked();
  fireEvent.click(control);
  await waitFor(() => expect(change).toHaveBeenCalledWith(false));
});
it('disables context changes while the assistant is busy', () => {
  render(
    <Theme>
      <AIThinkingSlider
        options={[{ id: 'auto', name: 'Thinking: Auto' }]}
        value="auto"
        disabled
        onChange={jest.fn()}
        contextManagement={false}
        onContextManagementChange={jest.fn()}
      />
    </Theme>
  );
  expect(
    screen.getByRole('switch', { name: 'Manage context window' })
  ).toBeDisabled();
});
