/** @jest-environment node */
import {
  aiRunNeedsConsent,
  AIRunConsent,
  aiActionClass,
  aiHardFloor,
  aiSensitiveAction,
  inferActScope,
  inferScriptScope,
} from '../browser/aiRunConsent';
import {
  AITaintTracker,
  aiLocalOrigin,
  aiOrigin,
  aiTaintedProjectAction,
} from '../browser/aiTaint';

it('classifies tools and keeps the sensitive and hard-floor tables small', () => {
  expect(aiActionClass('read_page')).toBe('read');
  expect(aiActionClass('type')).toBe('type');
  expect(aiActionClass('project_terminal')).toBe('shell');
  expect(aiActionClass('discover_tools')).toBeUndefined();
  expect(aiSensitiveAction('fill_saved_login')).toBe(true);
  expect(aiSensitiveAction('close_tab')).toBe(true);
  expect(aiSensitiveAction('close_tab', { userTab: false })).toBe(false);
  expect(aiSensitiveAction('click')).toBe(false);
  expect(aiHardFloor('request_access')).toBe(true);
  expect(aiHardFloor('fill_personal_data')).toBe(false);
  expect(aiHardFloor('fill_personal_data', { payment: true })).toBe(true);
  expect(aiHardFloor('upload_files', { outsideProject: true })).toBe(true);
  expect(aiHardFloor('upload_files')).toBe(false);
});

it('infers a run scope from act steps and from script source', () => {
  expect(
    inferActScope(
      [
        { tool: 'navigate', args: { url: 'https://app.test/login' } },
        { tool: 'read_page', args: {} },
        { tool: 'type', args: { elementId: 1, text: 'x' } },
        { tool: 'click', args: { elementId: 2 } },
      ],
      'https://other.test'
    )
  ).toEqual({
    classes: ['navigate', 'read', 'type', 'interact', 'navigate-cross-origin'],
    origins: ['https://other.test', 'https://app.test'],
  });
  const script = `
    const s = await session();
    const page = s.page();
    await page.goto('https://app.test/settings');
    const snap = await page.snapshot();
    await page.fill('@3', 'October');
    await page.click('text=Save');
    await page.fill('@4', { savedLogin: 'acct' });
  `;
  expect(inferScriptScope(script, 'https://app.test')).toEqual({
    classes: ['read', 'interact', 'type', 'navigate', 'saved-data', 'submit'],
    origins: ['https://app.test'],
  });
});

it('covers consented classes and websites once, remembers mid-run answers, and never in Full or Ask', () => {
  const consent = new AIRunConsent(
    'save settings',
    { classes: ['read', 'interact'], origins: ['https://app.test'] },
    'standard'
  );
  expect(consent.covers('read', 'https://app.test')).toBe(true);
  expect(consent.covers('interact', 'https://APP.test')).toBe(true);
  expect(consent.covers('type', 'https://app.test')).toBe(false);
  expect(consent.covers('interact', 'https://other.test')).toBe(false);
  consent.remember('type', 'https://other.test');
  expect(consent.covers('type', 'https://other.test')).toBe(true);
  expect(consent.covers('type', 'https://app.test')).toBe(false);
  expect(consent.covers(undefined, 'https://app.test')).toBe(false);
  expect(consent.describe()).toContain('Actions: read, interact');
  expect(consent.describe()).toContain('https://app.test');
  expect(
    new AIRunConsent('x', { classes: ['read'], origins: [] }, 'full').covers('read', undefined)
  ).toBe(false);
  expect(
    new AIRunConsent('x', { classes: ['read'], origins: [] }, 'ask').covers('read', undefined)
  ).toBe(false);
});

it('taints a controller on foreign reads only and gates shell, script and file writes', () => {
  expect(aiOrigin('https://App.test/path?q=1')).toBe('https://app.test');
  expect(aiOrigin('about:blank')).toBeUndefined();
  expect(aiLocalOrigin('http://localhost:5173')).toBe(true);
  expect(aiLocalOrigin('http://127.0.0.1:8000')).toBe(true);
  expect(aiLocalOrigin('http://app.localhost')).toBe(true);
  expect(aiLocalOrigin('https://app.test')).toBe(false);
  const tracker = new AITaintTracker();
  tracker.setOwnOrigins(['https://Staging.app.test']);
  expect(tracker.read('http://localhost:5173/dashboard')).toBeUndefined();
  expect(tracker.read('https://staging.app.test/docs')).toBeUndefined();
  expect(tracker.tainted).toBe(false);
  expect(tracker.read('https://github.com/x/y')).toBe('https://github.com');
  expect(tracker.tainted).toBe(true);
  expect(tracker.origins).toEqual(['https://github.com']);
  tracker.reset();
  expect(tracker.tainted).toBe(false);
  expect(
    aiTaintedProjectAction({ tool: 'project_terminal', args: { terminalAction: 'run', command: 'ls' } })
  ).toBe(true);
  expect(
    aiTaintedProjectAction({ tool: 'project_terminal', args: { terminalAction: 'read' } })
  ).toBe(false);
  expect(
    aiTaintedProjectAction({
      tool: 'project_scripts',
      args: { scriptRequest: { action: 'run', id: 'dev' } },
      manifestScripts: ['dev'],
    })
  ).toBe(false);
  expect(
    aiTaintedProjectAction({
      tool: 'project_scripts',
      args: { scriptRequest: { action: 'run', id: 'deploy' } },
      manifestScripts: ['dev'],
    })
  ).toBe(true);
  expect(
    aiTaintedProjectAction({ tool: 'project_files', args: { fileRequest: { action: 'save', path: 'docs/notes.md' } } })
  ).toBe(false);
  expect(
    aiTaintedProjectAction({ tool: 'project_files', args: { fileRequest: { action: 'save', path: 'src/index.ts' } } })
  ).toBe(true);
  expect(
    aiTaintedProjectAction({ tool: 'project_files', args: { fileRequest: { action: 'save', path: 'docs/../src/x' } } })
  ).toBe(true);
  expect(
    aiTaintedProjectAction({ tool: 'project_files', args: { fileRequest: { action: 'read', path: 'src/index.ts' } } })
  ).toBe(false);
});

it('adds no run consent for runs Standard mode already performs silently', () => {
  const reads = { classes: ['read', 'navigate', 'project-read'] as const, origins: ['http://127.0.0.1:5173'] };
  expect(aiRunNeedsConsent('standard', { classes: [...reads.classes], origins: [...reads.origins] })).toBe(false);
  expect(aiRunNeedsConsent('standard', { classes: ['read', 'type'], origins: [] })).toBe(true);
  expect(aiRunNeedsConsent('standard', { classes: ['navigate-cross-origin'], origins: [] })).toBe(true);
  expect(aiRunNeedsConsent('full', { classes: ['type', 'shell'], origins: [] })).toBe(false);
  expect(aiRunNeedsConsent('ask', { classes: ['type'], origins: [] })).toBe(false);
});
