export interface AIExtraction {
  selector: string;
  columns: { name: string; selector: string; attribute: 'text' | 'href' }[];
  offset: number;
  limit: number;
}

export function aiExtraction(args: Record<string, unknown>): AIExtraction {
  const selector = (value: unknown, empty = false) => {
    if (
      typeof value !== 'string' ||
      (!empty && !value.trim()) ||
      value.length > 500
    )
      throw new Error('Selectors must contain 1–500 characters.');
    return value;
  };
  if (
    !Array.isArray(args.columns) ||
    !args.columns.length ||
    args.columns.length > 20
  )
    throw new Error('columns must contain 1–20 named text or href fields.');
  const names = new Set<string>();
  const columns = args.columns.map((column) => {
    if (!column || typeof column !== 'object' || Array.isArray(column))
      throw new Error('Invalid extraction column.');
    const { name, attribute = 'text' } = column;
    if (
      typeof name !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(name) ||
      names.has(name) ||
      !['text', 'href'].includes(attribute) ||
      Object.keys(column).some(
        (key) => !['name', 'selector', 'attribute'].includes(key)
      )
    )
      throw new Error('Use unique column names and text or href attributes.');
    names.add(name);
    return {
      name,
      selector: selector(column.selector ?? '', true),
      attribute: attribute as 'text' | 'href',
    };
  });
  const offset = args.offset ?? 0;
  const limit = args.limit ?? 100;
  if (
    !Number.isInteger(offset) ||
    Number(offset) < 0 ||
    Number(offset) > 50000 ||
    !Number.isInteger(limit) ||
    Number(limit) < 1 ||
    Number(limit) > 200
  )
    throw new Error('offset must be 0–50000; limit must be 1–200.');
  return {
    selector: selector(args.selector),
    columns,
    offset: Number(offset),
    limit: Number(limit),
  };
}

/** Serialized into the isolated page world; no application state or scripts. */
export function extractAIPage(request: AIExtraction) {
  // Validate syntax even when there are no matching rows.
  document.createElement('div').matches(request.selector);
  request.columns.forEach((column) => {
    if (column.selector)
      document.createElement('div').querySelector(column.selector);
  });
  let visited = 0;
  let matched = 0;
  let textBudget = 50000;
  let textTruncated = false;
  let traversalLimitReached = false;
  const rows: Record<string, string | null>[] = [];
  const visible = (node: Element) => {
    if (!node.getClientRects().length) return false;
    const style = getComputedStyle(node);
    if (style.visibility === 'hidden' || style.visibility === 'collapse')
      return false;
    let ancestor: Element | null = node;
    while (ancestor) {
      if (
        ancestor.matches(
          'input,textarea,select,script,style,noscript,template,[hidden]'
        ) ||
        getComputedStyle(ancestor).opacity === '0'
      )
        return false;
      const root: Node = ancestor.getRootNode();
      ancestor =
        ancestor.assignedSlot ||
        ancestor.parentElement ||
        (root instanceof ShadowRoot ? root.host : null);
    }
    return true;
  };
  // Follow rendered open-shadow/slot content once, in composed tree order.
  // Lazy child lists avoid materializing a large page before its traversal cap.
  const children = (node: Node): ArrayLike<Node> => {
    if (node instanceof HTMLSlotElement) {
      const assigned = node.assignedNodes({ flatten: true });
      if (assigned.length) return assigned;
    }
    if (node instanceof Element && node.shadowRoot)
      return node.shadowRoot.childNodes;
    return node.childNodes;
  };
  const walk = (root: Node) => {
    const stack = [{ nodes: children(root), index: 0 }];
    const seen = new Set<Node>();
    return () => {
      while (stack.length) {
        const level = stack[stack.length - 1];
        if (level.index >= level.nodes.length) stack.pop();
        else {
          if (visited >= 50000) {
            traversalLimitReached = true;
            return null;
          }
          const node = level.nodes[level.index];
          level.index += 1;
          if (!seen.has(node)) {
            seen.add(node);
            visited += 1;
            stack.push({ nodes: children(node), index: 0 });
            return node;
          }
        }
      }
      return null;
    };
  };
  const find = (root: Element, selector: string) => {
    const next = walk(root);
    let node = next();
    while (node) {
      if (node instanceof Element && node.matches(selector)) return node;
      node = next();
    }
    return null;
  };
  const clipped = (text: string) => {
    const value = text.replace(/\s+/g, ' ').trim();
    const result = value.slice(0, Math.min(1000, textBudget));
    if (result.length < value.length) textTruncated = true;
    textBudget -= result.length;
    return result;
  };
  const text = (node: Element) => {
    const next = walk(node);
    const parts: string[] = [];
    let length = 0;
    let current = next();
    while (current && length < 1100) {
      const parent =
        current instanceof Text
          ? current.assignedSlot || current.parentElement
          : null;
      if (current.nodeType === Node.TEXT_NODE && parent && visible(parent)) {
        const value = (current.textContent || '').slice(0, 1100);
        parts.push(value);
        length += value.length;
      }
      current = next();
    }
    if (current || traversalLimitReached) textTruncated = true;
    return clipped(parts.join(' '));
  };
  const link = (field: Element): string | null => {
    if (!field.matches('a[href],area[href]')) return null;
    try {
      const url = new URL(field.getAttribute('href')!, document.baseURI);
      if (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      ) {
        // Return complete links only, never a truncated navigation URL.
        if (url.href.length <= Math.min(1000, textBudget)) {
          textBudget -= url.href.length;
          return url.href;
        }
        textTruncated = true;
      }
    } catch {
      // A malformed website link is missing data, not a tool failure.
    }
    return null;
  };
  const next = walk(document);
  let node = next();
  while (node) {
    if (
      node instanceof Element &&
      node.matches(request.selector) &&
      visible(node)
    ) {
      matched += 1;
      if (matched > request.offset) {
        if (rows.length === request.limit) break;
        const rowNode = node;
        const row: Record<string, string | null> = {};
        request.columns.forEach((column) => {
          const field = column.selector
            ? find(rowNode, column.selector)
            : rowNode;
          let value: string | null = null;
          if (field && visible(field)) {
            if (column.attribute === 'text') value = text(field);
            else value = link(field);
          }
          row[column.name] = value;
        });
        rows.push(row);
        if (!textBudget || visited >= 50000) break;
      }
    }
    node = next();
  }
  traversalLimitReached = traversalLimitReached || visited >= 50000;
  return {
    url: window.location.href,
    rows,
    offset: request.offset,
    nextOffset: request.offset + rows.length,
    hasMore: !!node || traversalLimitReached,
    coverage: {
      visited,
      traversalLimitReached,
      textTruncated,
      outputLimitReached: !textBudget,
    },
  };
}
