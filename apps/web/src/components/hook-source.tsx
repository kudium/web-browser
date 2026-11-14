import { javascriptLanguage } from '@codemirror/lang-javascript';
import { cssLanguage } from '@codemirror/lang-css';
import { classHighlighter, highlightTree } from '@lezer/highlight';
import type { ReactNode } from 'react';

// Parse and render text only. Hook source is never evaluated.
export function HookSource({ source, language = 'javascript' }: { source: string; language?: 'javascript' | 'css' }) {
  const nodes: ReactNode[] = [];
  let position = 0;
  const tree = (language === 'css' ? cssLanguage : javascriptLanguage).parser.parse(source);
  highlightTree(tree, classHighlighter, (from, to, classes) => {
    if (from > position) nodes.push(source.slice(position, from));
    nodes.push(<span key={from} className={classes}>{source.slice(from, to)}</span>);
    position = to;
  });
  if (position < source.length) nodes.push(source.slice(position));
  return <pre className="hook-highlighted-source"><code>{nodes}</code></pre>;
}
