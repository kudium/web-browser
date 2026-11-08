import { WebsiteTabRecovery } from '../main/websiteTabRecovery';
import type { IApp } from '../types';

const tab = (id: string, restorationId?: string) =>
  ({ id, name: id, url: 'https://example.test', restorationId } as IApp);

it('accepts explicit restoration and rejects delayed original layouts without archiving the restored tab', () => {
  const recovery = new WebsiteTabRecovery();
  recovery.retire('child');
  expect(recovery.check([tab('child')])).toEqual({
    id: 'child',
    archive: true,
  });
  expect(recovery.check([tab('child', 'restore-one')])).toBeUndefined();
  expect(recovery.check([tab('child')])).toEqual({
    id: 'child',
    archive: false,
  });
  expect(recovery.check([tab('child', 'restore-one')])).toBeUndefined();
});

it('requires a fresh generation after archiving a restored child', () => {
  const recovery = new WebsiteTabRecovery();
  recovery.retire('child');
  recovery.check([tab('child', 'restore-one')]);
  recovery.close('child', 'restore-one');
  expect(recovery.check([tab('child', 'restore-one')])).toEqual({
    id: 'child',
    archive: true,
  });
  expect(recovery.check([tab('child', 'restore-two')])).toBeUndefined();
  expect(recovery.check([tab('child', 'restore-one')])).toEqual({
    id: 'child',
    archive: false,
  });
});

it('does not partially advance generations when another entry rejects the same layout', () => {
  const recovery = new WebsiteTabRecovery();
  recovery.retire('one');
  recovery.retire('two');
  expect(recovery.check([tab('one', 'restore-one'), tab('two')])).toEqual({
    id: 'two',
    archive: true,
  });
  expect(recovery.check([tab('one')])).toEqual({ id: 'one', archive: true });
  expect(
    recovery.check([tab('one', 'restore-one'), tab('two', 'restore-two')])
  ).toBeUndefined();
});

it('leaves ordinary tab closure alone and clears state with the host', () => {
  const recovery = new WebsiteTabRecovery();
  recovery.close('ordinary');
  expect(recovery.check([tab('ordinary')])).toBeUndefined();
  recovery.retire('child');
  recovery.clear();
  expect(recovery.check([tab('child')])).toBeUndefined();
});
