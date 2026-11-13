import { terminalLinkTab } from '../browser/terminalLinks';
import { aiGroupId } from '../browser/aiGroups';
import type { IApp } from '../types';

const source = {
  id: 'one',
  sessionId: 'project',
  sessionName: 'Website',
  sessionProfileId: 'profile',
  spaceId: 'workspace',
  name: 'Home',
  url: 'https://example.com',
  icon: '',
} as IApp;
it('opens localhost links in a new tab in the terminal project group', () => {
  const first = terminalLinkTab(
    [source],
    aiGroupId(source),
    'http://localhost:3000',
    'other'
  );
  expect(first).toMatchObject({
    url: 'http://localhost:3000/',
    sessionId: 'project',
    sessionProfileId: 'profile',
    spaceId: 'workspace',
  });
  const second = terminalLinkTab(
    [source, first!],
    aiGroupId(source),
    'http://localhost:3000',
    'other'
  );
  expect(second?.id).not.toBe(first?.id);
});
it.each([
  // eslint-disable-next-line no-script-url -- Verifies executable links are rejected.
  'javascript:alert(1)',
  'file:///etc/passwd',
  'data:text/html,hello',
  'invalid',
])('ignores unsafe or invalid terminal URL %s', (url) => {
  expect(
    terminalLinkTab([source], aiGroupId(source), url, 'workspace')
  ).toBeUndefined();
});
it('does not open links for deleted or archived source groups', () => {
  expect(
    terminalLinkTab([], aiGroupId(source), 'https://example.com', 'workspace')
  ).toBeUndefined();
  expect(
    terminalLinkTab(
      [{ ...source, archived: true }],
      aiGroupId(source),
      'https://example.com',
      'workspace'
    )
  ).toBeUndefined();
});
