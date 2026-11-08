/** @jest-environment node */
/* eslint-disable no-await-in-loop */
import { AIComposerAttachments } from '../main/aiComposer';
import { extractDocument } from '../main/passwordManager/documents';

jest.mock('electron', () => ({ nativeImage: {} }));
jest.mock('../main/passwordManager/documents', () => ({
  extractDocument: jest
    .fn()
    .mockResolvedValue({ text: 'fixture', mime: 'text/plain' }),
}));

it('rejects a revoked import after extraction without occupying attachment capacity', async () => {
  const store = new AIComposerAttachments();
  let finish!: (value: { text: string; mime: string }) => void;
  (extractDocument as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  let current = true;
  const pending = store.add(
    'private.txt',
    Buffer.from('private fixture'),
    () => {
      if (!current) throw new Error('Request revoked');
    }
  );
  current = false;
  finish({ text: 'private fixture', mime: 'text/plain' });
  await expect(pending).rejects.toThrow('Request revoked');
  for (let index = 0; index < 8; index += 1)
    await store.add(`valid-${index}.txt`, Buffer.from('fixture'));
});

it('does no extraction when ownership is already invalid', async () => {
  (extractDocument as jest.Mock).mockClear();
  await expect(
    new AIComposerAttachments().add(
      'private.txt',
      Buffer.from('fixture'),
      () => {
        throw new Error('Request revoked');
      }
    )
  ).rejects.toThrow('Request revoked');
  expect(extractDocument).not.toHaveBeenCalled();
});
