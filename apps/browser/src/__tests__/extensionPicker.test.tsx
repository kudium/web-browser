import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { ExtensionPicker } from '../browser/ExtensionPicker';
import { browser } from '../browser/client';

jest.mock('../browser/client', () => ({
  browser: {
    preferenceAction: jest.fn().mockResolvedValue({
      extensionCatalog: [
        { id: 'a', name: 'Passwords' },
        { id: 'b', name: 'Notes' },
        { id: 'other-profile', name: 'Other' },
      ],
    }),
    preferences: jest.fn().mockResolvedValue({}),
  },
}));
customElements.define(
  'browser-action-list',
  class extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      ['a', 'b'].forEach((id) => {
        const button = document.createElement('button');
        button.id = id;
        button.title = id === 'a' ? 'Fill password on this page' : 'Notes';
        button.className = 'action';
        root.appendChild(button);
      });
    }
  }
);
const close = jest.fn();
const manage = jest.fn();
const store = jest.fn();
const view = (order: string[] | null = null) => (
  <Theme>
    <ExtensionPicker
      context={{ profile: 'one', tab: '1' }}
      order={order}
      close={close}
      manage={manage}
      store={store}
    />
  </Theme>
);

it('searches real action rows, pins without changing other profiles, and keeps nodes across updates', async () => {
  const { container, rerender } = render(view());
  const root = container.querySelector('browser-action-list')!.shadowRoot!;
  await waitFor(() =>
    expect(root.querySelector('.picker-name')).toHaveTextContent('Passwords')
  );
  const action = root.querySelector<HTMLElement>('#a')!;
  fireEvent.click(
    root.querySelector<HTMLButtonElement>('[aria-label="Unpin Passwords"]')!
  );
  await waitFor(() =>
    expect(browser.preferences).toHaveBeenCalledWith('update', {
      extensionToolbarOrder: ['b', 'other-profile'],
    })
  );
  expect(close).not.toHaveBeenCalled();
  rerender(view(['b', 'other-profile']));
  fireEvent.change(screen.getByLabelText('Search extensions'), {
    target: { value: 'Passwords' },
  });
  await waitFor(() =>
    expect(root.querySelector('#b')!.parentElement).toHaveAttribute('hidden')
  );
  expect(root.querySelector('#a')).toBe(action);
  expect(root.querySelectorAll('.picker-row')).toHaveLength(2);
  fireEvent.click(
    root.querySelector<HTMLButtonElement>('[aria-label="Pin Passwords"]')!
  );
  await waitFor(() =>
    expect(browser.preferences).toHaveBeenLastCalledWith('update', {
      extensionToolbarOrder: ['b', 'other-profile', 'a'],
    })
  );
  const click = jest.fn();
  action.addEventListener('click', click);
  fireEvent.keyDown(root.querySelector('.picker-name')!, { key: 'Enter' });
  expect(click).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

it('keeps a failed pin reviewable and updates live metadata and action removal', async () => {
  (browser.preferences as jest.Mock).mockRejectedValueOnce(
    new Error('disk full')
  );
  const { container } = render(view());
  const root = container.querySelector('browser-action-list')!.shadowRoot!;
  await waitFor(() =>
    expect(
      root.querySelector('[aria-label="Unpin Passwords"]')
    ).not.toBeDisabled()
  );
  fireEvent.click(root.querySelector('[aria-label="Unpin Passwords"]')!);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be updated'
  );
  root.querySelector<HTMLElement>('#a')!.title = 'New action title';
  await waitFor(() =>
    expect(root.querySelector('.picker-name')).toHaveAttribute(
      'title',
      'New action title'
    )
  );
  root.querySelector('#b')!.remove();
  await waitFor(() =>
    expect(root.querySelectorAll('.picker-row')).toHaveLength(1)
  );
  fireEvent.change(screen.getByLabelText('Search extensions'), {
    target: { value: 'missing' },
  });
  expect(await screen.findByText('No matching extensions')).toBeInTheDocument();
});
