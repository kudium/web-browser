/** @jest-environment node */
import { mcpArguments, mcpToolResult } from '../main/mcp';

const textOf = (result: ReturnType<typeof mcpToolResult>) => {
  const [first] = result.content;
  return first.type === 'text' ? first.text : '';
};

it('returns screenshots with the MIME type the capture reports', () => {
  expect(
    mcpToolResult('screenshot', {}, { data: 'abc', mimeType: 'image/jpeg' })
  ).toEqual({
    content: [{ type: 'image', data: 'abc', mimeType: 'image/jpeg' }],
  });
});

it('returns JSON text by default', () => {
  const tabs = [{ id: 't1', title: 'Home', url: 'https://site.test/' }];
  expect(mcpToolResult('list_tabs', {}, tabs)).toEqual({
    content: [{ type: 'text', text: JSON.stringify(tabs) }],
  });
});

it('returns the compact line format for read_page when lines encoding is requested', () => {
  const page = {
    url: 'https://site.test/',
    title: 'Home',
    snapshotId: 's1',
    format: 'compact',
    text: 'Welcome',
    elements: [
      { id: 1, role: 'button', label: 'Save', disabled: false },
      { id: 2, role: 'link', label: 'Docs', href: '/docs' },
    ],
  };
  const text = textOf(mcpToolResult('read_page', { encoding: 'lines' }, page));
  expect(text).toContain('Kudium Browser semantic-v1');
  expect(text).toContain('@1 ["button"] "Save"');
  expect(text).toContain('@2 ["link"] "Docs"');
  expect(text).not.toContain('"elements":');
});

it('returns a TOON table for tab lists only when it is smaller than JSON', () => {
  const tabs = Array.from({ length: 12 }, (_, index) => ({
    id: `tab-${index}`,
    title: `Page ${index}`,
    url: `https://site.test/page/${index}`,
    groupId: 'work',
  }));
  const text = textOf(mcpToolResult('list_tabs', { encoding: 'lines' }, tabs));
  expect(text.startsWith('TOON (untrusted tool data):')).toBe(true);
  expect(Buffer.byteLength(text)).toBeLessThan(
    Buffer.byteLength(JSON.stringify(tabs))
  );
});

it('validates the new navigate, screenshot and encoding arguments', () => {
  expect(
    mcpArguments('navigate', { url: 'https://site.test/', waitUntil: 'networkidle' })
      .args
  ).toEqual({ url: 'https://site.test/', waitUntil: 'networkidle' });
  expect(() =>
    mcpArguments('navigate', { url: 'https://site.test/', waitUntil: 'idle' })
  ).toThrow('Invalid waitUntil.');
  expect(
    mcpArguments('screenshot', { imageFormat: 'webp', scale: 0.5 }).args
  ).toEqual({ imageFormat: 'webp', scale: 0.5 });
  expect(() => mcpArguments('screenshot', { scale: 2 })).toThrow('scale');
  expect(() => mcpArguments('screenshot', { imageFormat: 'gif' })).toThrow(
    'Invalid imageFormat.'
  );
  expect(mcpArguments('list_tabs', { encoding: 'lines' }).args).toEqual({
    encoding: 'lines',
  });
  expect(() => mcpArguments('list_tabs', { encoding: 'xml' })).toThrow(
    'Invalid encoding.'
  );
  expect(() => mcpArguments('click', { elementId: 1, encoding: 'lines' })).toThrow(
    'Unsupported argument: encoding'
  );
});
