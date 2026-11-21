/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  extensionDocumentId,
  assertExtensionDocument,
} from '../main/extensionDocuments';
jest.mock('electron', () => ({}));

test('extension document addresses reject credentials, ports and other privileged protocols', () => {
  const id = 'a'.repeat(32);
  expect(extensionDocumentId(`chrome-extension://${id}/options.html`)).toBe(id);
  for (const url of [
    'file:///private/key',
    'chrome://settings',
    `chrome-extension://user@${id}/options.html`,
    `chrome-extension://${id}:443/options.html`,
    'chrome-extension://invalid/options.html',
  ])
    expect(extensionDocumentId(url)).toBeUndefined();
});

test('extension tabs resolve only reviewed resources loaded in their own group session', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudium-extension-document-'),
  );
  const id = 'a'.repeat(32),
    url = `chrome-extension://${id}/options.html`;
  const extension = { id, path: root };
  const own = {
    extensions: {
      getExtension: (requested: string) =>
        requested === id ? extension : undefined,
    },
  };
  const other = { extensions: { getExtension: () => undefined } };
  try {
    fs.writeFileSync(path.join(root, 'options.html'), '<h1>Options</h1>');
    expect(() => assertExtensionDocument(url, own as any)).not.toThrow();
    expect(() => assertExtensionDocument(url, other as any)).toThrow(
      'unavailable',
    );
    expect(() =>
      assertExtensionDocument(
        `chrome-extension://${id}/missing.html`,
        own as any,
      ),
    ).toThrow();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
