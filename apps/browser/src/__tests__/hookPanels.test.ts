import { panelJSON, validateHookPanel } from '../browser/hookPanels';
import {
  hookPanelDocument,
  hookPanelPresentation,
} from '../main/hookPanelDocument';
import { hookPanelExamples } from '../browser/hookPanelExamples';
it('accepts bounded output formats and declared actions without functions in the payload', () => {
  for (const content of [
    { type: 'text', text: 'Output' },
    { type: 'markdown', text: '# Title' },
    { type: 'json', value: { count: 2 } },
    { type: 'table', columns: ['Value'], rows: [[3]] },
    { type: 'status', state: 'loading', text: 'Working' },
    {
      type: 'html',
      html: '<input>',
      script: 'console.log(1)',
      data: { count: 1 },
    },
  ]) {
    expect(
      validateHookPanel({
        id: 'output',
        title: 'Output',
        content,
        actions: [{ id: 'refresh', label: 'Refresh' }],
      }).id,
    ).toBe('output');
  }
});
it('rejects unbounded output, mismatched tables, invalid declarations and privileged configuration', () => {
  for (const content of [
    { type: 'table', columns: ['One'], rows: [[1, 2]] },
    { type: 'html', html: '<p>', preload: 'file:///privileged' },
    { type: 'script', source: 'run()' },
    { type: 'json' },
  ])
    expect(() =>
      validateHookPanel({ id: 'output', title: 'Output', content }),
    ).toThrow();
  expect(() =>
    validateHookPanel({
      id: 'output',
      title: 'Output',
      content: { type: 'text', text: 'x'.repeat(100001) },
    }),
  ).toThrow();
  expect(() => panelJSON(undefined)).toThrow();
  expect(() =>
    validateHookPanel({
      id: '../escape',
      title: 'Output',
      content: { type: 'text', text: 'a' },
    }),
  ).toThrow();
  expect(() =>
    validateHookPanel({
      id: 'output',
      title: 'Output',
      content: { type: 'text', text: 'a' },
      actions: [
        { id: 'refresh', label: 'A' },
        { id: 'refresh', label: 'B' },
      ],
    }),
  ).toThrow();
});
it('renders structured output as presentation and keeps custom HTML isolated', () => {
  const output = {
    id: 'out',
    title: 'Output',
    content: {
      type: 'markdown' as const,
      text: '# Title\n<script>evil()</script>\n[Bad](javascript:evil())\n[Good](https://example.com)',
    },
  };
  const html = hookPanelPresentation(output).renderedHTML;
  expect(html).toContain('<h1>Title</h1>');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('href="javascript:');
  expect(html).toContain('href="https://example.com"');
  const doc = hookPanelDocument({
    ...output,
    content: {
      type: 'html',
      html: '<input>',
      script: 'console.log("</script>")',
    },
  });
  expect(doc).toContain("connect-src 'none'");
  expect(doc).toContain("frame-src 'none'");
  expect(doc).toContain('kudiumHookPanel');
  expect(doc).toContain('<\\/script>');
});
it('provides executable examples for every output shape', () => {
  expect(hookPanelExamples).toHaveLength(5);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const sample of hookPanelExamples)
    expect(
      () => new AsyncFunction('context', 'document', 'url', sample.source),
    ).not.toThrow();
});
