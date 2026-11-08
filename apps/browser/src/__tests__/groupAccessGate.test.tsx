import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { GroupAccessGate } from '../components/UI/GroupAccessGate';
import { assertGroupChanges } from '../utils/groupAccess';
import type { GroupLockState } from '../browser/groupLocks';
import type { IApp } from '../types';

const item = {
  id: 'one',
  sessionId: 'work',
  name: 'Work',
  url: 'https://example.com',
} as IApp;
let publish: (state: GroupLockState) => void;
const locked: GroupLockState = {
  protected: ['work'],
  unlocked: [],
  available: true,
};
const unlocked = { ...locked, unlocked: ['work'] };
const request = jest.fn();
beforeAll(() => {
  Object.assign(window, {
    electron: {
      groupLocks: {
        request,
        onState: (listener: typeof publish) => {
          publish = listener;
        },
      },
    },
  });
});
it('hides editor contents until authentication succeeds, and removes them immediately on OS lock', async () => {
  request.mockResolvedValueOnce(locked);
  render(
    <Theme>
      <GroupAccessGate item={item}>
        <input aria-label="Group home page" />
      </GroupAccessGate>
    </Theme>
  );
  await waitFor(() => expect(screen.getByText('Unlock group')).toBeTruthy());
  expect(screen.queryByLabelText('Group home page')).toBeNull();
  expect(() => assertGroupChanges([item], [])).toThrow('Unlock');
  expect(() =>
    assertGroupChanges([item], [{ ...item, sessionId: 'other' }])
  ).toThrow('Unlock');
  request.mockRejectedValueOnce(new Error('Authentication cancelled'));
  fireEvent.click(screen.getByText('Unlock group'));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('cancelled')
  );
  expect(screen.queryByLabelText('Group home page')).toBeNull();
  request.mockResolvedValueOnce(unlocked);
  fireEvent.click(screen.getByText('Unlock group'));
  await waitFor(() =>
    expect(screen.getByLabelText('Group home page')).toBeTruthy()
  );
  expect(() =>
    assertGroupChanges([item], [{ ...item, name: 'Updated' }])
  ).not.toThrow();
  act(() => publish(locked));
  expect(screen.queryByLabelText('Group home page')).toBeNull();
  expect(() =>
    assertGroupChanges([item], [{ ...item, name: 'Updated' }])
  ).toThrow('Unlock');
});
