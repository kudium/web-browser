export interface SearchEngine {
  id: string;
  name: string;
  keyword?: string;
  url: string;
}
export const defaultSearchEngines: SearchEngine[] = [
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    keyword: 'ddg',
    url: 'https://duckduckgo.com/?q=%s',
  },
  {
    id: 'google',
    name: 'Google',
    keyword: 'google',
    url: 'https://www.google.com/search?q=%s',
  },
  {
    id: 'bing',
    name: 'Bing',
    keyword: 'bing',
    url: 'https://www.bing.com/search?q=%s',
  },
];
export function validateSearchEngines(value: unknown): SearchEngine[] {
  if (!Array.isArray(value) || !value.length || value.length > 50)
    throw new Error('Keep between 1 and 50 search engines.');
  const ids = new Set<string>();
  const keywords = new Set<string>();
  return value.map((engine) => {
    if (
      !engine ||
      typeof engine.id !== 'string' ||
      !/^[\w-]{1,80}$/.test(engine.id) ||
      ids.has(engine.id)
    )
      throw new Error('Search engine identifiers must be unique.');
    ids.add(engine.id);
    if (
      typeof engine.name !== 'string' ||
      !engine.name.trim() ||
      engine.name.length > 80
    )
      throw new Error('Enter a search engine name (up to 80 characters).');
    if (
      typeof engine.url !== 'string' ||
      engine.url.length > 2000 ||
      !engine.url.includes('%s')
    )
      throw new Error(
        'The search URL must include %s where the search term belongs.'
      );
    let url: URL;
    try {
      url = new URL(engine.url.replaceAll('%s', 'search'));
    } catch {
      throw new Error('Enter a valid HTTP or HTTPS search URL.');
    }
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error(
        'Use an HTTP or HTTPS search URL without login credentials.'
      );
    const keyword =
      typeof engine.keyword === 'string'
        ? engine.keyword.trim().toLowerCase()
        : '';
    if (engine.keyword !== undefined && typeof engine.keyword !== 'string')
      throw new Error('Enter a valid search shortcut.');
    if (
      keyword &&
      (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(keyword) || keywords.has(keyword))
    )
      throw new Error(
        'Use a unique shortcut with letters, numbers, hyphens or underscores (up to 32 characters).'
      );
    if (keyword) keywords.add(keyword);
    return {
      id: engine.id,
      name: engine.name.trim(),
      url: engine.url.trim(),
      ...(keyword ? { keyword } : {}),
    };
  });
}

export function matchSearchEngines(engines: SearchEngine[], query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const score = (engine: SearchEngine) => {
    if (engine.keyword?.toLowerCase() === term) return 0;
    if (engine.name.toLowerCase() === term) return 1;
    return 2;
  };
  return engines
    .filter(
      (engine) =>
        engine.name.toLowerCase().startsWith(term) ||
        engine.keyword?.toLowerCase().startsWith(term)
    )
    .sort((a, b) => score(a) - score(b));
}
export function searchUrl(engine: SearchEngine, query: string) {
  if (!query.trim()) throw new Error(`Enter a search for ${engine.name}.`);
  return engine.url.replaceAll('%s', encodeURIComponent(query.trim()));
}
