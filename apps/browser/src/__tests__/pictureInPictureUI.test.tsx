import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { PictureInPictureButton } from '../components/UI/PictureInPictureButton';

it('shows a compact accessible control only for a supported playing video', () => {
  const onToggle = jest.fn();
  const { rerender } = render(
    <Theme>
      <PictureInPictureButton
        state={undefined}
        disabled={false}
        onToggle={onToggle}
      />
    </Theme>
  );
  expect(screen.queryByRole('button')).toBeNull();
  rerender(
    <Theme>
      <PictureInPictureButton
        state={{ available: true, active: false }}
        disabled={false}
        onToggle={onToggle}
      />
    </Theme>
  );
  const button = screen.getByRole('button', { name: 'Picture in picture' });
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(button.textContent).toBe('');
  fireEvent.click(button);
  expect(onToggle).toHaveBeenCalledTimes(1);
  rerender(
    <Theme>
      <PictureInPictureButton
        state={{ available: false, active: true }}
        disabled={false}
        onToggle={onToggle}
      />
    </Theme>
  );
  expect(
    screen.getByRole('button', { name: 'Exit picture in picture' })
  ).toHaveAttribute('aria-pressed', 'true');
  rerender(
    <Theme>
      <PictureInPictureButton
        state={{ available: false, active: false }}
        disabled={false}
        onToggle={onToggle}
      />
    </Theme>
  );
  expect(screen.queryByRole('button')).toBeNull();
});

it.each([
  { busy: true, disabled: false },
  { busy: false, disabled: true },
])(
  'disables duplicate requests and unavailable tabs: %p',
  ({ busy, disabled }) => {
    const onToggle = jest.fn();
    render(
      <Theme>
        <PictureInPictureButton
          state={{ available: true, active: false, busy }}
          disabled={disabled}
          onToggle={onToggle}
        />
      </Theme>
    );
    const button = screen.getByRole('button', { name: 'Picture in picture' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  }
);
