/** @jest-environment node */
import {
  AIRunCapCounter,
  AIRunCapError,
  AI_RUN_DEFAULT_CAPS,
  aiRunCapCharge,
  aiRunCaps,
} from '../browser/aiRunCaps';

it('validates caps against the maximums and fills defaults', () => {
  expect(aiRunCaps(undefined)).toEqual(AI_RUN_DEFAULT_CAPS);
  expect(aiRunCaps({ tabs: 3 })).toEqual({ ...AI_RUN_DEFAULT_CAPS, tabs: 3 });
  expect(() => aiRunCaps({ navigations: 5000 })).toThrow('between 0 and 2000');
  expect(() => aiRunCaps({ uploads: 1.5 })).toThrow('caps.uploads');
  expect(() => aiRunCaps({ nope: 1 })).toThrow('unsupported key "nope"');
  expect(() => aiRunCaps([])).toThrow('caps must be an object');
});

it('charges navigations, tabs, uploads and project bytes only', () => {
  expect(aiRunCapCharge('navigate', {})).toEqual({ navigations: 1 });
  expect(aiRunCapCharge('back', {})).toEqual({ navigations: 1 });
  expect(aiRunCapCharge('create_group', {})).toEqual({ tabs: 1 });
  expect(aiRunCapCharge('upload_files', {})).toEqual({ uploads: 1 });
  expect(aiRunCapCharge('project_files', { fileRequest: { action: 'save', path: 'a', text: 'héllo' } })).toEqual({
    projectBytes: 6,
  });
  expect(aiRunCapCharge('project_files', { fileRequest: { action: 'preview', path: 'a' } })).toEqual({});
  expect(aiRunCapCharge('read_page', {})).toEqual({});
});

it('fails the first step over a cap and names the cap, leaving usage untouched', () => {
  const counter = new AIRunCapCounter({ ...AI_RUN_DEFAULT_CAPS, tabs: 1, projectBytes: 10 });
  counter.charge('new_tab', {});
  expect(() => counter.charge('new_tab', {})).toThrow(AIRunCapError);
  expect(() => counter.charge('create_group', {})).toThrow('Run cap reached: 1 tabs');
  counter.charge('project_files', { fileRequest: { action: 'save', path: 'docs/a.md', text: '123456' } });
  expect(() =>
    counter.charge('project_files', { fileRequest: { action: 'create-file', path: 'b', text: '12345' } })
  ).toThrow('10 bytes written to the project folder');
  expect(counter.summary()).toEqual({
    used: { navigations: 0, tabs: 1, uploads: 0, projectBytes: 6 },
    caps: { ...AI_RUN_DEFAULT_CAPS, tabs: 1, projectBytes: 10 },
  });
  // Zero means "none this run".
  const none = new AIRunCapCounter({ ...AI_RUN_DEFAULT_CAPS, uploads: 0 });
  expect(() => none.charge('upload_chat_attachment', {})).toThrow('0 uploads');
});
