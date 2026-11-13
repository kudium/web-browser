import type { GlobalHook } from './hookMarketplace';

/** Visible, reversible examples. Nothing runs until the user enables it. */
export const sampleGlobalHooks: GlobalHook[] = [
  {
    id: 'sample-reading-font',
    name: 'Sample: Comfortable reading',
    enabled: false,
    path: '/*',
    testUrl: 'https://example.com',
    exclusions: [],
    before: '',
    after: '',
    css: '/* Enlarge article text without changing the rest of the page. */\narticle p, main p {\n  font-size: 18px !important;\n  line-height: 1.8 !important;\n}',
  },
  {
    id: 'sample-highlight-links',
    name: 'Sample: Highlight links',
    enabled: false,
    path: '/*',
    testUrl: 'https://example.com',
    exclusions: [],
    before: '',
    after: '',
    css: '/* Make links easy to spot. */\na[href] {\n  color: #007aff !important;\n  text-decoration: underline !important;\n  text-underline-offset: 3px !important;\n}',
  },
  {
    id: 'sample-reduce-motion',
    name: 'Sample: Reduce motion',
    enabled: false,
    path: '/*',
    testUrl: 'https://example.com',
    exclusions: [],
    before: '',
    after: '',
    css: '/* Stop decorative animations and smooth scrolling. */\n*, *::before, *::after {\n  animation-duration: 0.01ms !important;\n  animation-iteration-count: 1 !important;\n  transition-duration: 0.01ms !important;\n  scroll-behavior: auto !important;\n}',
  },
];
