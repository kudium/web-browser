import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Theme } from '@radix-ui/themes';
import {
  GroupTabsSettings,
  GroupTabChanges,
} from '../components/UI/GroupTabsSettings';
import { websiteAddress } from '../utils/websiteAddress';

it.each([
  ['  example.com  ', 'https://example.com/'],
  ['//example.com/path', 'https://example.com/path'],
  ['localhost:3000', 'https://localhost:3000/'],
  ['http://example.com', 'http://example.com/'],
])('normalizes %s', (input, expected) => {
  expect(websiteAddress(input)).toBe(expected);
});
it.each([
  '',
  'hello world',
  // eslint-disable-next-line no-script-url
  'javascript:alert(1)',
  'https://',
  'ftp://example.com',
])('rejects invalid website %s without a raw URL exception', (input) => {
  expect(() => websiteAddress(input)).toThrow(/website address/);
});
it('edits a text list, preserving custom names, and reflects changes in individual tabs', () => {
  const tabs = [
    {
      id: 'a',
      name: 'Example',
      customName: 'My site',
      url: 'https://example.com/',
      icon: '',
    },
  ];
  function Editor() {
    const [changes, setChanges] = useState<GroupTabChanges>({
      edits: {},
      added: [],
      removed: [],
    });
    return (
      <Theme>
        <GroupTabsSettings
          tabs={tabs}
          changes={changes}
          onChange={setChanges}
        />
      </Theme>
    );
  }
  render(<Editor />);
  fireEvent.click(screen.getByRole('button', { name: 'Text list' }));
  fireEvent.change(screen.getByLabelText('Tab URL list'), {
    target: { value: '  example.com  \n\nother.com\n' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Individual tabs' }));
  expect(screen.getByLabelText('Tab name: My site')).toHaveValue('My site');
  expect(screen.getByLabelText('Tab address: My site')).toHaveValue(
    '  example.com  '
  );
  expect(screen.getAllByPlaceholderText('https://example.com')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Text list' }));
  fireEvent.change(screen.getByLabelText('Tab URL list'), {
    target: { value: '' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Individual tabs' }));
  expect(
    screen.queryByLabelText('Tab address: My site')
  ).not.toBeInTheDocument();
});
