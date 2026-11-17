import { expect, test } from 'bun:test';
import { createApp } from '../src/app';
import type { Database } from '../src/db';
import { useCases } from '../src/use-cases';
import { tutorials } from '../src/tutorials';

const app = createApp({ db: {} as Database, assetOrigins: [] });

test('use cases are public, discoverable, and link to real guides and screenshots', async () => {
  const response = await app.request('/use-cases');
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('href="https://browser.kudium.com/use-cases"');
  expect(html).toContain('aria-current="page"');
  expect(html).not.toContain('name="robots" content="noindex"');
  for (const item of useCases) {
    expect(html).toContain(`href="#${item.id}"`);
    expect(html).toContain(`id="${item.id}"`);
    for (const [slug] of item.guides) {
      expect(tutorials.some(tutorial => tutorial.slug === slug)).toBe(true);
      expect(html).toContain(`href="/tutorials/${slug}"`);
    }
    const asset = await app.request(`/assets/product/demo/${item.image}.webp`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('image/webp');
  }
  const homepage = await (await app.request('/')).text();
  expect(homepage).toContain('href="/use-cases"');
  expect(homepage).toContain('href="/use-cases#developers"');
  expect(homepage).toContain('href="/use-cases#research"');
});
