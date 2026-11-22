import { pageHookBody } from '../../../../packages/hooks/runtime';
import { hookSourceValidator } from '../browser/hookValidation';
import { hookExamples } from '../browser/hookExamples';
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
it('validates every built-in example using the same wrapper as saving and execution', () => {
  for (const sample of hookExamples) {
    expect(
      hookSourceValidator.errors({
        name: sample.name,
        before: '',
        after: '',
        css: '',
        [sample.stage]: sample.source,
      }),
    ).toEqual([]);
  }
  expect(
    hookSourceValidator.errors({
      before: '',
      css: '',
      after: '// Example\nconst content = {};',
    }),
  ).toEqual([
    expect.objectContaining({
      line: 2,
      message: expect.stringContaining('content'),
    }),
  ]);
  expect(
    hookSourceValidator.errors({
      before: '',
      css: '',
      after: 'const panel = {};',
    }),
  ).toEqual([
    expect.objectContaining({ message: expect.stringContaining('panel') }),
  ]);
});
it.each(hookPanelExamples)(
  'executes $name and its declared actions in the actual callback wrapper',
  async (sample) => {
    const original = document.body.innerHTML,
      title = document.title;
    document.title = 'Fixture page';
    document.body.innerHTML =
      '<h1>Page</h1><a href="https://example.com/one"> One </a><a href="https://example.com/two">Two</a>';
    const outputs: any[] = [];
    const handlers = new Map<string, (payload: unknown) => unknown>();
    const publish = async (input: unknown) => {
      const output = validateHookPanel(input);
      outputs.push(output);
      return { id: output.id };
    };
    const context = {
      document,
      url: 'https://example.com/',
      content: document.documentElement.outerHTML,
      panel: {
        show: publish,
        update: publish,
        onAction: (id: string, handler: (payload: unknown) => unknown) =>
          handlers.set(id, handler),
      },
    };
    try {
      const AsyncFunction = Object.getPrototypeOf(
        async function () {},
      ).constructor;
      await new AsyncFunction('context', pageHookBody(sample.source))(context);
      expect(outputs.length).toBeGreaterThan(0);
      const first = outputs.at(-1);
      if (sample.id === 'panel-markdown') {
        expect(first.content.text).toContain('\n\n');
        expect(hookPanelPresentation(first).renderedHTML).toContain('<p><a');
      }
      if (sample.id === 'panel-table')
        expect(first.content.rows).toEqual([
          ['One', 'https://example.com/one'],
          ['Two', 'https://example.com/two'],
        ]);
      if (sample.id === 'panel-json')
        expect(first.content.value).toMatchObject({
          title: 'Fixture page',
          headings: 1,
        });
      if (sample.id === 'panel-status')
        expect(outputs.map((p) => p.content.state)).toEqual([
          'loading',
          'success',
        ]);
      for (const action of first.actions || []) {
        expect(handlers.has(action.id)).toBe(true);
        const a = document.createElement('a');
        a.href = 'https://example.com/three';
        document.body.append(a);
        await handlers.get(action.id)!({});
        const update = outputs.at(-1);
        expect(update.reveal).toBe(false);
        if (update.content.type === 'html') {
          if (sample.id === 'panel-html') expect(update.content.data.links).toBe(3);
          if (sample.id === 'panel-media') expect(update.content.data.total).toBe(0);
          expect(update.content.html).toBe(first.content.html);
          expect(update.content.script).toBe(first.content.script);
        } else expect(update.content.text).toContain('3 links');
      }
    } finally {
      document.body.innerHTML = original;
      document.title = title;
    }
  },
);

it('extracts distinct media links and pages through the whole list without fetching files', async () => {
  const previous = document.body.innerHTML;
  document.body.innerHTML = '<img src="https://example.com/cover.jpg" alt="Cover"><video><source src="https://example.com/clip.mp4"></video><audio src="https://example.com/song.mp3"></audio>' +
    Array.from({length:27}, (_,i) => `<a href="https://example.com/image-${i}.webp">Image ${i}</a>`).join('') +
    '<a href="https://example.com/cover.jpg">Duplicate</a><img src="blob:transient"><a href="https://user:secret@example.com/private.mp3">Private URL</a>';
  const outputs: any[] = [];
  const actions = new Map<string, () => Promise<unknown>>();
  const publish = async (input: unknown) => { const output = validateHookPanel(input); outputs.push(output); return {id:output.id}; };
  const context = {document, url:'https://example.com', panel:{update:publish,onAction:(id: string, action: () => Promise<unknown>) => actions.set(id,action)}};
  try {
    const sample = hookPanelExamples.find(item => item.id === 'panel-media')!;
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    await new AsyncFunction('context',pageHookBody(sample.source))(context);
    expect(outputs[0].content.data).toMatchObject({total:30,pages:3,page:0});
    expect(outputs[0].content.data.items.map((item: any) => item.kind)).toEqual(expect.arrayContaining(['image','video','audio']));
    const all = [...outputs[0].content.data.items];
    await actions.get('media-next')!(); all.push(...outputs.at(-1).content.data.items);
    await actions.get('media-next')!(); all.push(...outputs.at(-1).content.data.items);
    expect(all).toHaveLength(30);
    expect(new Set(all.map(item => item.url)).size).toBe(30);
    expect(outputs.at(-1).content.data.items).toHaveLength(6);
    await actions.get('media-next')!(); expect(outputs.at(-1).content.data.page).toBe(2);
    await actions.get('media-previous')!(); expect(outputs.at(-1).content.data.page).toBe(1);
    document.body.innerHTML = '';
    await actions.get('media-refresh')!();
    expect(outputs.at(-1).content.data).toMatchObject({total:0,page:0,pages:1,items:[]});
  } finally { document.body.innerHTML = previous; }
});
