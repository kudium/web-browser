import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { PageStatus } from '../components/UI/PageStatus';
import { pageFailure } from '../browser/pageStatus';
import { BrowserState } from '../browser/contracts';

it('shows compact errors, collapsible diagnostics and working recovery controls', () => {
  const retry = jest.fn();
  const back = jest.fn();
  render(
    <Theme>
      <PageStatus
        state={
          {
            error: 'ERR_NAME_NOT_RESOLVED',
            errorCode: -105,
            canGoBack: true,
          } as BrowserState
        }
        url="https://example.com/private?token=secret"
        retry={retry}
        back={back}
      />
    </Theme>
  );
  expect(screen.getByText('This website can’t be found')).toBeVisible();
  expect(screen.getByText('example.com')).toBeVisible();
  expect(screen.queryByText(/token=secret/)).toBeNull();
  expect(screen.getByText('Details').closest('details')).not.toHaveAttribute(
    'open'
  );
  fireEvent.click(screen.getByText('Try again'));
  expect(retry).toHaveBeenCalled();
  fireEvent.click(screen.getByText('Go back'));
  expect(back).toHaveBeenCalled();
});
it('keeps first loads blank and distinguishes offline, timeout, certificate and crash states', () => {
  render(
    <Theme>
      <PageStatus
        state={{ initialLoading: true } as BrowserState}
        url="https://example.com"
        retry={() => {}}
        back={() => {}}
      />
    </Theme>
  );
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByText('Opening website')).toBeNull();
  expect(pageFailure(-106).title).toBe('You’re offline');
  expect(pageFailure(-118).title).toMatch(/too long/);
  expect(pageFailure(-202).title).toMatch(/isn’t secure/);
  expect(pageFailure(-10000).title).toMatch(/stopped responding/);
});
