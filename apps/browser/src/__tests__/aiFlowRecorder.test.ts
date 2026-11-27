/** @jest-environment node */
import { aiFlowName, aiFlowSlug, renderAIFlowScript, renderAIFlowSkill } from '../browser/aiFlowRecorder';
import { profilePartition, DISPOSABLE_PROFILE_PREFIX, isDisposableProfile } from '../utils/groups';
import { aiRunGroups } from '../browser/aiRun';
import { AIRunConsent, aiRunNeedsConsent } from '../browser/aiRunConsent';
import { taskInputFromTool } from '../browser/aiTasks';
import { validateAITask } from '../main/aiTasks';

it('renders receipts as a selector-based run_script body without element ids', () => {
  const script = renderAIFlowScript(
    [
      { tool: 'navigate', args: { url: 'https://app.test/login' }, tabId: 'a' },
      { tool: 'read_page', args: { format: 'compact' }, tabId: 'a' },
      { tool: 'type', args: { elementId: 3, snapshotId: 's', text: 'benchmark' }, label: 'Username', role: 'textbox', tabId: 'a' },
      { tool: 'click', args: { elementId: 4, snapshotId: 's' }, label: 'Sign in', tabId: 'a' },
      { tool: 'wait_until', args: { url: 'https://app.test/dashboard', timeoutMs: 5000, format: 'compact' }, tabId: 'a' },
      { tool: 'new_tab', args: { url: 'https://docs.test/', disposable: true }, tabId: 'a', openedTabId: 'b' },
      { tool: 'click', args: { selector: 'css=#save' }, tabId: 'b' },
      { tool: 'click', args: { elementId: 9, snapshotId: 's' }, tabId: 'b' },
      { tool: 'screenshot', args: {}, tabId: 'b' },
      { tool: 'close_tab', args: { tabId: 'b' }, tabId: 'b' },
      { tool: 'list_tabs', args: {} },
      { tool: 'hand_off', args: { reason: 'x' } },
    ],
    { name: 'Login check' }
  );
  expect(script).toBe(`// Flow: Login check
const s = await session();
let page = s.page();
await page.goto("https://app.test/login");
await page.snapshot();
await page.fill("role=textbox[name=\\"Username\\"]", "benchmark");
await page.click("text=Sign in");
await page.waitFor({"url":"https://app.test/dashboard","timeoutMs":5000});
const page2 = await s.newPage("https://docs.test/", { disposable: true });
await page2.click("css=#save");
// click: target unavailable in the receipt; add a selector.
await page2.screenshot();
await page2.close();
// hand_off: not replayable as a script step.
return { done: true };
`);
  expect(script).not.toContain('elementId');
  expect(renderAIFlowSkill('Login check', '', script)).toContain('name: Login check');
  expect(aiFlowSlug('Login check!')).toBe('login-check');
  expect(() => aiFlowName('a/b')).toThrow('slashes');
});

it('names disposable partitions in memory and keeps ordinary ones persisted', () => {
  expect(profilePartition('abc')).toBe('persist:kudiumbrowser-abc');
  const profile = `${DISPOSABLE_PROFILE_PREFIX}123`;
  expect(isDisposableProfile(profile)).toBe(true);
  expect(profilePartition(profile)).toBe('kudiumbrowser-disposable:123');
  expect(profilePartition(profile).startsWith('persist:')).toBe(false);
});

it('declares groups in the run consent and allows switches inside the set only', () => {
  expect(aiRunGroups(undefined)).toBeUndefined();
  expect(aiRunGroups(['g1', 'g1', 'g2'])).toEqual(['g1', 'g2']);
  expect(() => aiRunGroups(['', 'x'])).toThrow('groups');
  const consent = new AIRunConsent('qa', { classes: ['read'], origins: [], groups: ['g1'] }, 'standard');
  expect(consent.allowsGroup('g1')).toBe(true);
  expect(consent.allowsGroup('g2')).toBe(false);
  expect(consent.describe()).toContain('Groups: g1');
  expect(consent.scope.groups).toEqual(['g1']);
  expect(aiRunNeedsConsent('standard', { classes: ['read'], origins: [], groups: ['g1'] })).toBe(false);
});

it('carries a scheduled script through task validation', () => {
  const input = taskInputFromTool({ name: 'Nightly', instructions: 'Check the dashboard', script: 'return 1;', scheduleKind: 'manual' });
  expect(input.script).toBe('return 1;');
  expect(validateAITask(input).script).toBe('return 1;');
  expect(() => validateAITask({ ...input, script: '' })).toThrow('script');
  expect(validateAITask(taskInputFromTool({ name: 'Plain', instructions: 'x', scheduleKind: 'manual' })).script).toBeUndefined();
});
