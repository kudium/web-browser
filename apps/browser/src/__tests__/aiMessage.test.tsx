import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIMessage, renderAIMessage } from '../components/UI/AIMessage';
import { browser } from '../browser/client';

jest.mock('../browser/client', () => ({ browser: { nativeMenu: jest.fn() } }));

it('renders headings, action items, tables, links and fenced code', () => {
  const { container } = render(
    <AIMessage
      text={
        '## Next steps\n\n- [x] **Review** the release\n- [ ] Deploy\n\n[Release](https://example.com/release)\n\n| Task | State |\n| --- | --- |\n| Build | Ready |\n\n```ts\nconst ready = true;\n```'
      }
    />
  );
  expect(screen.getByRole('heading', { name: 'Next steps' })).toBeVisible();
  expect(container.querySelector('strong')).toHaveTextContent('Review');
  expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
  expect(screen.getAllByRole('checkbox')[1]).toBeDisabled();
  expect(screen.getByRole('table')).toHaveTextContent('Build');
  expect(screen.getByRole('link', { name: 'Release' })).toHaveAttribute(
    'rel',
    'noopener noreferrer'
  );
  expect(container.querySelector('pre code')).toHaveTextContent(
    'const ready = true;'
  );
});

it('rejects raw HTML, scripts, active embeds and non-web link protocols', () => {
  const html = renderAIMessage(
    '<script>alert(1)</script>\n\n<img src="https://tracker.test" onerror="alert(1)">\n\n[Run](javascript:alert%281%29) [Local](file:///etc/passwd) [Relative](/settings)'
  );
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.querySelector('script,img,iframe')).toBeNull();
  expect(document.querySelector('a[href]')).toBeNull();
  expect(document.body.innerHTML).not.toContain('onerror');
});

it('renders only real text references as local links and keeps code inert', () => {
  const groups = [
    {
      id: '["work","default"]',
      name: 'Work',
      slug: 'work',
      tabs: [
        {
          id: 'one',
          name: 'Resume',
          slug: 'resume',
          url: 'https://example.com',
          icon: '',
        },
      ],
    },
  ];
  const html = renderAIMessage(
    '**@work** has one tab. @work/resume \n\n`@work` [@work](https://example.com) @unknown',
    groups
  );
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.querySelectorAll('.ai-inline-reference')).toHaveLength(2);
  expect(document.querySelector('.ai-inline-reference')?.textContent).toBe(
    '@Work'
  );
  expect(document.querySelector('code')?.textContent).toBe('@work');
  expect(
    document.querySelector('a[href="https://example.com/"]')?.textContent
  ).toBe('@work');
});

it('offers link and code-specific copy commands while preserving Markdown', async () => {
  const copy = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: copy },
  });
  (browser.nativeMenu as jest.Mock)
    .mockResolvedValueOnce('link')
    .mockResolvedValueOnce('code');
  const { container } = render(
    <AIMessage
      text={
        '[Example](https://example.com/path)\n\n```js\nconst ready = true;\n```'
      }
    />
  );
  fireEvent.contextMenu(screen.getByRole('link', { name: 'Example' }));
  await waitFor(() =>
    expect(copy).toHaveBeenCalledWith('https://example.com/path')
  );
  fireEvent.contextMenu(container.querySelector('pre')!);
  await waitFor(() =>
    expect(copy).toHaveBeenCalledWith('const ready = true;\n')
  );
  expect(
    (browser.nativeMenu as jest.Mock).mock.calls
      .at(-1)[0]
      .map((item: any) => item.label)
  ).toEqual(['Copy code', 'Copy message']);
});
it('uses real tab and group menus for inline references instead of link actions', () => {
  const tabMenu = jest.fn();
  const groupMenu = jest.fn();
  render(
    <AIMessage
      text="@work/page @work"
      groups={
        [
          {
            id: 'work',
            slug: 'work',
            name: 'Work',
            tabs: [
              {
                id: 'page',
                slug: 'page',
                name: 'Page',
                url: 'https://example.com',
                icon: '',
              },
            ],
          },
        ] as any
      }
      onTabContextMenu={tabMenu}
      onGroupContextMenu={groupMenu}
    />
  );
  fireEvent.contextMenu(screen.getByRole('link', { name: '@Page' }));
  expect(tabMenu).toHaveBeenCalledWith('page');
  fireEvent.contextMenu(screen.getByRole('link', { name: '@Work' }));
  expect(groupMenu).toHaveBeenCalledWith('work');
});
