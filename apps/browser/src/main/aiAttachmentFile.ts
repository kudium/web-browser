import { AI_ATTACHMENT_BYTES } from '../browser/aiComposer';
import { readBoundedLocalFile } from './boundedLocalFile';

/** Descriptor-bound import retaining the existing attachment size policy. */
export async function readAIAttachmentFile(
  filename: string,
  assertCurrent: () => void = () => {}
) {
  return readBoundedLocalFile(
    filename,
    AI_ATTACHMENT_BYTES,
    assertCurrent,
    'Choose a regular file between 1 byte and 20 MB.'
  );
}
