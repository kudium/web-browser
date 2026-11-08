import { smartTabLabels } from '../utils/smartTabLabels';

it('brings unique text forward without changing original titles', () => {
  const tabs = [
    {
      id: 'a',
      title: 'Hocasa: Apartment in Toronto',
      url: 'https://example.com/toronto',
    },
    {
      id: 'b',
      title: 'Hocasa: Apartment in Ottawa',
      url: 'https://example.com/ottawa',
    },
  ];
  const labels = smartTabLabels(tabs);
  expect(labels.get('a')).toBe('Toronto');
  expect(labels.get('b')).toBe('Ottawa');
  expect(smartTabLabels(tabs, false).get('a')).toBe(tabs[0].title);
});
it('uses paths and stable numbers for duplicates, preserves custom names and omits query secrets', () => {
  const tabs = [
    {
      id: 'a',
      title: 'Hocasa',
      url: 'https://example.com/homes/toronto?token=secret',
    },
    { id: 'b', title: 'Hocasa', url: 'https://example.com/homes/ottawa' },
    { id: 'c', title: 'Hocasa', url: 'https://example.com/homes/ottawa' },
    {
      id: 'd',
      title: 'Hocasa',
      url: 'https://example.com/homes/custom',
      customName: 'My home',
    },
  ];
  const labels = smartTabLabels(tabs);
  expect(labels.get('a')).toBe('toronto / homes');
  expect(labels.get('b')).toBe('ottawa / homes · 1');
  expect(labels.get('c')).toBe('ottawa / homes · 2');
  expect(labels.get('d')).toBe('My home');
  expect(Array.from(labels.values()).join(' ')).not.toContain('secret');
});
