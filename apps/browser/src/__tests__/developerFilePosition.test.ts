import {
  readFilePosition,
  writeFilePosition,
} from '../browser/developerFilePosition';
beforeEach(() => localStorage.clear());
it('restores navigation separately for each project without file contents', () => {
  const state = {
    folder: 'src',
    openFile: 'src/app.ts',
    hidden: true,
    query: 'app',
    expanded: ['src', 'src/components'],
    selected: ['src/app.ts'],
    scroll: 320,
  };
  writeFilePosition('one:/project', state);
  expect(readFilePosition('one:/project')).toEqual(state);
  expect(readFilePosition('one:/another-project').folder).toBe('');
  expect(JSON.stringify(readFilePosition('one:/project'))).not.toContain(
    'text'
  );
});
it('recovers from corrupted storage and bounds invalid metadata', () => {
  localStorage.setItem('kudiumbrowser-file-position:broken', '{');
  expect(readFilePosition('broken').folder).toBe('');
  localStorage.setItem(
    'kudiumbrowser-file-position:bad',
    JSON.stringify({
      folder: 42,
      expanded: ['src', null],
      selected: [false],
      scroll: -10,
      query: 'x'.repeat(2000),
    })
  );
  expect(readFilePosition('bad')).toEqual({
    folder: '',
    hidden: false,
    openFile: undefined,
    expanded: ['src'],
    selected: [],
    scroll: 0,
    query: 'x'.repeat(1000),
  });
});
