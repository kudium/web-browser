import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HookSource } from '../src/components/hook-source';

test('JavaScript source is highlighted and dangerous markup stays escaped text', () => {
  const source = 'const title = "</code><script>alert(1)</script>"; api.showResult(context.title);';
  const html = renderToStaticMarkup(<HookSource source={source} />);
  expect(html).toContain('tok-keyword');
  expect(html).toContain('tok-string');
  expect(html).toContain('tok-propertyName');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;/code&gt;');
});

test('CSS source uses CSS tokens and preserves whitespace', () => {
  const source = 'a[href] {\n  color: #007aff;\n}\n';
  const html = renderToStaticMarkup(<HookSource source={source} language="css" />);
  expect(html).toContain('tok-propertyName');
  expect(html.replace(/<[^>]*>/g, '')).toBe(source);
});
