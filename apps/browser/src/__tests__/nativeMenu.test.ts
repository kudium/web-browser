import { parseNativeMenu } from '../main/nativeMenu';

it('validates IDs, types, state, depth and size before compiling native menu entries', () => {
  const menu = [
    { id: '0', label: 'One' },
    { type: 'separator' },
    { label: 'Sub', submenu: [{ id: '1', label: 'Two', enabled: false }] },
  ];
  const copied = parseNativeMenu(menu);
  expect(copied).toEqual([
    { id: '0', label: 'One', enabled: true },
    { type: 'separator' },
    {
      label: 'Sub',
      enabled: true,
      submenu: [{ id: '1', label: 'Two', enabled: false }],
    },
  ]);
  expect(copied).not.toBe(menu);
  [
    null,
    [null],
    Array(2),
    [{ label: 'One', id: {} }],
    [{ label: 'One', enabled: 'false' }],
    [{ label: 'One', type: 'checkbox' }],
    [{ label: 'One', submenu: false }],
    [
      { id: 'same', label: 'One' },
      { label: 'Sub', submenu: [{ id: 'same', label: 'Two' }] },
    ],
    Array.from({ length: 201 }, () => ({ label: 'Too many' })),
  ].forEach((value) => expect(() => parseNativeMenu(value)).toThrow());
  let nested: unknown = [{ label: 'Leaf' }];
  for (let level = 0; level < 6; level += 1)
    nested = [{ label: 'Nested', submenu: nested }];
  expect(() => parseNativeMenu(nested)).toThrow('Invalid menu');
});
