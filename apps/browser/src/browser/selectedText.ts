/** Serialize only the current selection, never page HTML, scripts or styles. */
export function selectedTextMarkdown(expected: string): {text: string; markdown: string} | undefined {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.toString().trim() !== expected.trim()) return;
  const text = selection.toString().trim();
  if (!text || text.length > 30000) return;
  const range = selection.getRangeAt(0);
  const deadline = performance.now() + 8;
  // Bound the subtree before cloning; a huge DOM must fall back to plain text.
  const probe = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_ALL);
  let inspected = 0;
  while (probe.nextNode()) {
    if (++inspected > 1500 || performance.now() > deadline) return;
  }
  let fragment: Node = range.cloneContents();
  const start = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  const anchor = start?.closest('a');
  if (anchor && anchor.contains(range.endContainer)) {
    const wrapper = document.createElement('a');
    wrapper.setAttribute('href', anchor.getAttribute('href') || '');
    wrapper.appendChild(fragment);
    fragment = wrapper;
  }
  let count = 0;
  let links = 0;
  let formatted = false;
  const escape = (value: string) => value.replace(/[\\\[\]*_`]/g, '\\$&');
  const walk = (node: Node): string => {
    if (++count > 1500 || performance.now() > deadline) throw new Error('Selection too complex');
    if (node.nodeType === 3) return escape(node.textContent || '');
    if (node.nodeType !== 1 && node.nodeType !== 11) return '';
    const element = node as Element;
    if (['SCRIPT','STYLE','INPUT','TEXTAREA','SELECT'].includes(element.tagName)) return '';
    if (element.tagName === 'BR') return '\n';
    const body = Array.from(node.childNodes).map(walk).join('');
    if (element.tagName === 'A') {
      try {
        const url = new URL(element.getAttribute('href') || '', document.baseURI);
        if (['http:','https:'].includes(url.protocol) && !url.username && !url.password && url.href.length <= 4096 && body.trim()) {
          links++;
          return `[${body}](${url.href.replace(/[()\\\s]/g, value => '%' + value.charCodeAt(0).toString(16).toUpperCase())})`;
        }
      } catch { /* Invalid destinations remain plain text. */ }
    }
    if (['B','STRONG'].includes(element.tagName)) {formatted=true; return `**${body}**`;}
    if (['I','EM'].includes(element.tagName)) {formatted=true; return `_${body}_`;}
    if (['S','DEL'].includes(element.tagName)) return `~~${body}~~`;
    return body + (['P','DIV','LI','H1','H2','H3','BLOCKQUOTE'].includes(element.tagName) ? '\n' : '');
  };
  try {
    const markdown = walk(fragment).trim();
    if ((links || formatted) && markdown.length <= 30000) return {text,markdown};
  } catch { /* Keep the original plain selection on budget exhaustion. */ }
}
