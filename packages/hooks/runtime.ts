/** Shared by parser validation and the sandboxed page-hook runtime.
 * Keep this function self-contained: it is embedded into the isolated preload.
 */
export function pageHookBody(source: string): string {
  return (
    '"use strict"; const {url, document, content, page, log, notify, activity, notes, panel, setInterval, setTimeout, onCleanup, signal, listen, runId} = context;\n' +
    source
  );
}
