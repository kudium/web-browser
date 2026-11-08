import { render, waitFor } from '@testing-library/react';
import { ExtensionActions } from '../browser/ExtensionActions';

it('reconnects extension observers when changing login profiles, but keeps them for same-profile tabs', () => {
  const connected: string[] = [];
  const disconnected: string[] = [];
  if (!customElements.get('browser-action-list')) {
    customElements.define(
      'browser-action-list',
      class extends HTMLElement {
        constructor() {
          super();
          const root = this.attachShadow({ mode: 'open' });
          ['a', 'b', 'c'].forEach((id) => {
            const button = document.createElement('button');
            button.id = id;
            button.className = 'action';
            root.appendChild(button);
          });
        }

        connectedCallback() {
          connected.push(this.getAttribute('partition')!);
        }

        disconnectedCallback() {
          disconnected.push(this.getAttribute('partition')!);
        }
      }
    );
  }
  const { container, rerender } = render(
    <ExtensionActions
      context={{ profile: 'persist:kudiumbrowser-a', tab: '1' }}
      order={null}
    />
  );
  const first = container.firstChild;
  rerender(
    <ExtensionActions
      context={{ profile: 'persist:kudiumbrowser-a', tab: '2' }}
      order={null}
    />
  );
  expect(container.firstChild).toBe(first);
  expect((first as Element).getAttribute('tab')).toBe('2');
  rerender(
    <ExtensionActions
      context={{ profile: 'persist:kudiumbrowser-b', tab: '3' }}
      order={null}
    />
  );
  expect(container.firstChild).not.toBe(first);
  expect(connected).toEqual(['persist:kudiumbrowser-a', 'persist:kudiumbrowser-b']);
  expect(disconnected).toEqual(['persist:kudiumbrowser-a']);
  rerender(<ExtensionActions context={undefined} order={null} />);
  expect(container.childNodes).toHaveLength(0);
  expect(disconnected).toEqual(['persist:kudiumbrowser-a', 'persist:kudiumbrowser-b']);
});

it('updates pinned icons live, keeps DOM focus order aligned and applies policy to newly loaded actions', async () => {
  const { container, rerender } = render(
    <ExtensionActions
      context={{ profile: 'pinning', tab: '1' }}
      order={['c', 'a']}
    />
  );
  const element = container.firstElementChild!;
  const root = element.shadowRoot!;
  expect(root.querySelector<HTMLElement>('#b')!.hidden).toBe(true);
  expect([...root.querySelectorAll('.action')].map((node) => node.id)).toEqual([
    'c',
    'a',
    'b',
  ]);
  const newAction = document.createElement('button');
  newAction.id = 'new';
  newAction.className = 'action';
  root.appendChild(newAction);
  await waitFor(() => expect(newAction.hidden).toBe(true));
  rerender(
    <ExtensionActions context={{ profile: 'pinning', tab: '2' }} order={null} />
  );
  expect(container.firstElementChild).toBe(element);
  expect([...root.querySelectorAll('.action')].map((node) => node.id)).toEqual([
    'a',
    'b',
    'c',
    'new',
  ]);
  expect(
    [...root.querySelectorAll<HTMLElement>('.action')].every(
      (node) => !node.hidden
    )
  ).toBe(true);
});
