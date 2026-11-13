import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { SpaceSettingsForm } from '../components/UI/SpaceSettingsForm';

beforeAll(() => {
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })) as unknown as typeof ResizeObserver;
});

it('offers an optional website colors setting', () => {
  const onChange = jest.fn();
  render(
    <Theme>
      <SpaceSettingsForm
        value={{ name: 'Work', color: 'iris', useWebsiteColors: false }}
        creating={false}
        onChange={onChange}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />
    </Theme>
  );
  const toggle = screen.getByRole('switch', { name: 'Match website color' });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  expect(onChange).toHaveBeenCalledWith({ useWebsiteColors: true });
});

it('labels the saved color as a fallback and keeps details in the hint', () => {
  render(
    <Theme>
      <SpaceSettingsForm
        value={{ name: 'Work', color: 'iris', useWebsiteColors: true }}
        creating={false}
        onChange={jest.fn()}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />
    </Theme>
  );
  expect(screen.getByText('Fallback color')).toBeInTheDocument();
  expect(screen.queryByText('Primary color')).not.toBeInTheDocument();
  expect(
    screen.getByRole('switch', { name: 'Use primary color for frame' })
  ).toBeChecked();
  expect(
    screen.queryByRole('button', { name: 'Frame color' })
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Uses the active site/)).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'About Match website color' })
  );
  expect(screen.getByText(/Uses the active site/)).toHaveTextContent(
    'focused pane'
  );
});
