import type { WebContents } from 'electron';
import { selectedTextMarkdown } from '../browser/selectedText';
/** Capture on action only; stale selection or a busy page falls back to plain text. */
export async function captureSelectedText(contents: WebContents, expected: string) {
  if (!expected.trim() || expected.length > 30000 || contents.isDestroyed()) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      contents.executeJavaScriptInIsolatedWorld(999,[{code:`(${selectedTextMarkdown.toString()})(${JSON.stringify(expected)})`}]),
      new Promise<undefined>(resolve => {timer=setTimeout(()=>resolve(undefined),100);}),
    ]);
    if (typeof result?.text === 'string' && result.text === expected.trim() && typeof result.markdown === 'string' && result.markdown.length <= 30000) return result as {text:string;markdown:string};
  } catch { /* A navigation or detached frame must not prevent plain capture. */ }
  finally {if(timer)clearTimeout(timer);}
  return undefined;
}
