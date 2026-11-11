import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { GroupEditor } from '../components/UI/GroupEditor';
import { AppManager } from '../utils/AppManager';

Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })),
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    'user_apps',
    JSON.stringify([
      {
        id: 'work',
        sessionId: 'work',
        sessionName: 'Work',
        name: 'Work',
        url: 'https://example.com',
        icon: '',
      },
    ])
  );
  Object.assign(window, {
    electron: {
      platform: 'darwin',
      siteDeveloper: { project: jest.fn().mockResolvedValue(null) },
      browser: { chooseSpaceIcon: jest.fn(), showEmojiPicker: jest.fn() },
      ipcRenderer: { sendMessage: jest.fn() },
    },
  });
});

it('keeps group icon choices on demand and saves the shared identity', async () => {
  const close = jest.fn();
  render(
    <Theme>
      <GroupEditor item={AppManager.getAll()[0]} close={close} />
    </Theme>
  );
  expect(
    screen.queryByLabelText('Emoji for Choose group icon')
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Choose group icon' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Use 💼 for Choose group icon' })
  );
  expect(close).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Choose group icon' })
  ).toHaveTextContent('💼');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(AppManager.getAll()[0].sessionIconEmoji).toBe('💼');
});

it('preserves the icon when image selection is cancelled or fails and restores the default group icon', async () => {
  window.electron.browser.chooseSpaceIcon = jest
    .fn()
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error('Image unavailable'))
    .mockResolvedValueOnce('data:image/png;base64,aGVsbG8=');
  render(
    <Theme>
      <GroupEditor
        item={{ ...AppManager.getAll()[0], sessionIconEmoji: '💼' }}
        close={jest.fn()}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose group icon' }));
  const image = screen.getByRole('button', {
    name: 'Choose image for Choose group icon',
  });
  fireEvent.click(image);
  await waitFor(() => expect(image).toBeEnabled());
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(image);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Image unavailable'
  );
  fireEvent.click(image);
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  );
  expect(
    screen.getByRole('button', { name: 'Choose group icon' })
  ).not.toHaveTextContent('💼');
  fireEvent.click(screen.getByRole('button', { name: 'Choose group icon' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use folder icon' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(AppManager.getAll()[0].sessionIconImage).toBeUndefined();
});

it('edits tab addresses directly and preserves group identity', async () => {
  const close = jest.fn();
  render(
    <Theme>
      <GroupEditor item={AppManager.getAll()[0]} close={close} />
    </Theme>
  );
  fireEvent.change(screen.getByLabelText('Tab address: Work'), {
    target: { value: 'https://example.com/home' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(AppManager.getAll()[0].url).toBe('https://example.com/home');
  expect(AppManager.getAll()[0].sessionId).toBe('work');
});
it('rejects non-web tab addresses without saving', async () => {
  const close = jest.fn();
  render(
    <Theme>
      <GroupEditor item={AppManager.getAll()[0]} close={close} />
    </Theme>
  );
  fireEvent.change(screen.getByLabelText('Tab address: Work'), {
    // eslint-disable-next-line no-script-url
    target: { value: 'javascript:alert(1)' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'isn’t a website address. Try example.com or https://example.com.'
  );
  expect(close).not.toHaveBeenCalled();
  expect(AppManager.getAll()[0].url).toBe('https://example.com');
});

it('opens Developer for this group without saving the group settings form', async () => {
  const close = jest.fn();
  const opened = jest.fn();
  window.addEventListener('kudiumbrowser-open-group-developer', opened);
  try {
    render(
      <Theme>
        <GroupEditor item={AppManager.getAll()[0]} close={close} />
      </Theme>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Developer' }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.mock.calls[0][0].detail).toBe('work');
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener('kudiumbrowser-open-group-developer', opened);
  }
});
