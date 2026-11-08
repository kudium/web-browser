import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { AdvancedSettings } from '../components/View/Settings/AdvancedSettings';
import { defaultPreferences } from '../browser/preferences';

Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })),
});

it('uses the shared group identity while saving to its shared login profile', async () => {
  localStorage.setItem(
    'user_apps',
    JSON.stringify([
      {
        id: 'work-tab',
        sessionId: 'work-group',
        sessionProfileId: 'shared-login',
        sessionName: 'Work',
        sessionIconEmoji: '💼',
        name: 'Work',
        url: 'https://example.com',
        icon: '',
      },
    ])
  );
  const save = jest.fn().mockResolvedValue(true);
  render(
    <Theme>
      <AdvancedSettings
        section="compatibility"
        preferences={defaultPreferences}
        info={{
          profiles: [{ id: 'shared-login', name: 'Work', extensions: 0 }],
          languages: [],
          versions: { touchbox: '', engine: '', chromium: '' },
        }}
        busy={false}
        save={save}
      />
    </Theme>
  );
  const picker = screen.getByRole('button', { name: 'Settings group' });
  expect(picker).toHaveTextContent('Browser defaults');
  fireEvent.click(picker);
  const work = await screen.findByRole('option', { name: /Work/ });
  expect(work).toHaveTextContent('💼');
  fireEvent.click(work);
  expect(picker).toHaveTextContent('💼');
  expect(
    screen.getByText(/every group sharing the selected login profile/)
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText('Custom user agent'), {
    target: { value: 'Work Browser/1.0' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      advanced: expect.objectContaining({
        userAgent: '',
        profileUserAgents: { 'shared-login': 'Work Browser/1.0' },
      }),
    })
  );
  localStorage.removeItem('user_apps');
});
