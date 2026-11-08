import { AIRecoveryObservation } from '../main/aiRecovery';

it('refuses stale interactions until successful tab listing and page reading', () => {
  const recovery = new AIRecoveryObservation();
  expect(() => recovery.check('click', 'first')).toThrow('list_tabs');
  recovery.completed('list_tabs');
  expect(() => recovery.check('click', 'first')).toThrow('read_page');
  recovery.completed('find_element', 'first');
  expect(() => recovery.check('click', 'first')).toThrow('read_page');
  recovery.completed('read_page', 'first');
  expect(() => recovery.check('click', 'first')).not.toThrow();
  expect(() => recovery.check('type', 'second')).toThrow('read_page');
});

it('requires another read after document-changing actions', () => {
  const recovery = new AIRecoveryObservation();
  recovery.completed('list_tabs');
  recovery.completed('read_page', 'first');
  recovery.completed('navigate', 'first');
  expect(() => recovery.check('type', 'first')).toThrow('read_page');
  recovery.completed('read_page', 'first');
  expect(() => recovery.check('type', 'first')).not.toThrow();
});

it('permits observations and live dialog handoff without requiring a blocked page read', () => {
  const recovery = new AIRecoveryObservation();
  expect(() => recovery.check('read_page', 'first')).not.toThrow();
  expect(() => recovery.check('list_tabs')).not.toThrow();
  expect(() => recovery.check('handle_dialog', 'first')).toThrow('list_tabs');
  recovery.completed('list_tabs');
  expect(() => recovery.check('handle_dialog', 'first')).not.toThrow();
  expect(() => recovery.check('new_tab')).not.toThrow();
});

it('accepts a successful wait snapshot as a fresh observation for its tab', () => {
  const recovery = new AIRecoveryObservation();
  recovery.completed('list_tabs');
  recovery.completed('wait_until', 'first');
  expect(() => recovery.check('click', 'first')).not.toThrow();
  expect(() => recovery.check('click', 'second')).toThrow('read_page');
});

it('does not let extraction or target lookup unlock resumed page actions', () => {
  const recovery = new AIRecoveryObservation();
  recovery.completed('list_tabs');
  recovery.completed('extract_rows', 'first');
  recovery.completed('find_element', 'first');
  recovery.completed('screenshot', 'first');
  ['click', 'press_key', 'select_options', 'drag', 'upload_files'].forEach(
    (name) => {
      expect(() => recovery.check(name as any, 'first')).toThrow('read_page');
    }
  );
  recovery.completed('read_page', 'second');
  expect(() => recovery.check('click', 'first')).toThrow('read_page');
  expect(() => recovery.check('click', 'second')).not.toThrow();
});
