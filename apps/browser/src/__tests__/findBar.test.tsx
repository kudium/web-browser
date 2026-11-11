import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { FindBar } from '../components/UI/FindBar';

it('passes a trimmed query to AI and supports find and Escape', () => {
  const ai = jest.fn();
  const next = jest.fn();
  const close = jest.fn();
  render(
    <Theme>
      <FindBar
        value="  hello world  "
        onChange={jest.fn()}
        onNext={next}
        onClose={close}
        onSearchAI={ai}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Search with AI' }));
  expect(ai).toHaveBeenCalledWith('hello world');
  expect(next).not.toHaveBeenCalled();
  fireEvent.submit(screen.getByRole('search'));
  expect(next).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  expect(close).toHaveBeenCalledTimes(1);
});

it('disables actions for a whitespace-only query', () => {
  render(
    <Theme>
      <FindBar
        value="   "
        onChange={jest.fn()}
        onNext={jest.fn()}
        onClose={jest.fn()}
        onSearchAI={jest.fn()}
      />
    </Theme>
  );
  expect(screen.getByRole('button', { name: 'Search with AI' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
});
