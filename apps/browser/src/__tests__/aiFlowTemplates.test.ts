/** @jest-environment node */
import { renderFlowTemplate, selectFlowTemplate } from '../browser/aiFlowTemplates';

it('selects templates and fills slots from the request', () => {
  expect(selectFlowTemplate('Sign in to https://app.test/login')).toMatchObject({
    template: { id: 'sign_in' },
    slots: { url: 'https://app.test/login' },
    missing: [],
  });
  expect(selectFlowTemplate('Open the notifications settings page')).toMatchObject({
    template: { id: 'open_settings' },
    slots: { label: 'notifications settings' },
  });
  expect(selectFlowTemplate('Extract the table, first 20 rows')).toMatchObject({
    template: { id: 'extract_table' },
    slots: { limit: '20' },
  });
  expect(selectFlowTemplate('Check if this page says "Payment received"')).toMatchObject({
    template: { id: 'check_phrase' },
    slots: { phrase: 'Payment received' },
  });
  expect(selectFlowTemplate('Write a poem about browsers')).toBeUndefined();
  expect(selectFlowTemplate('Open https://x.test')).toBeUndefined();
});

it('renders a run_script call with escaped slot values and the template name as intent', () => {
  const selection = selectFlowTemplate('Check if the page contains it\'s "done"')!;
  const call = renderFlowTemplate(selection);
  expect(call.tool).toBe('run_script');
  expect(call.args.intent).toBe('Check a page for a phrase');
  expect(call.args.source).toContain('"its done"');
  expect(call.args.source).not.toContain("it's");
  const settings = renderFlowTemplate(selectFlowTemplate('Open profile settings')!, 'open profile');
  expect(settings.args.source).toContain('page.find("profile settings")');
  expect(settings.args.intent).toBe('open profile');
  const table = renderFlowTemplate(selectFlowTemplate('export the table')!);
  expect(table.args.source).toContain('limit: 50');
  expect(() =>
    renderFlowTemplate({ template: selection.template, slots: {}, missing: ['phrase'] })
  ).toThrow('needs: phrase');
});
