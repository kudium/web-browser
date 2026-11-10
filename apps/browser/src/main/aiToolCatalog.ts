import { aiProviderTools } from '../browser/aiToolSchemas';
import { AI_TASK_MEMORY_TOOL } from '../browser/aiTaskMemory';

import {
  families,
  hints,
  intentBundles,
  hookRuntimeGuide,
} from '../browser/aiToolCapabilities';

const words = (text: string) =>
  text
    .toLowerCase()
    .match(/[a-z0-9_]+/g)
    ?.filter(
      (word) =>
        ![
          'a',
          'the',
          'to',
          'for',
          'with',
          'this',
          'page',
          'can',
          'you',
          'i',
          'of',
        ].includes(word)
    ) || [];

/** A provider-neutral alternative to provider-specific deferred tool schemas. */
export class AIToolCatalog {
  private all = aiProviderTools();
  private searchCalls = 0;
  private searchMisses = 0;
  private schemaCharacters = 0;

  diagnostics() {
    return {
      toolDiscoveryCalls: this.searchCalls,
      toolDiscoveryMisses: this.searchMisses,
      toolSchemaCharacters: this.schemaCharacters,
    };
  }

  recordRequest() {
    this.schemaCharacters += JSON.stringify(this.tools()).length;
  }

  private loaded = new Set<string>(
    this.all
      .filter(
        (tool) =>
          !Object.values(families).some((names) =>
            (names as readonly string[]).includes(tool.function.name)
          )
      )
      .map((tool) => tool.function.name)
  );

  constructor(messages: any[] = []) {
    // Restore discovery and previously used definitions after pause/restart.
    messages.forEach((message) =>
      message.tool_calls?.forEach((call: any) => {
        if (call.function?.name === 'discover_tools') {
          try {
            this.discover(JSON.parse(call.function.arguments));
          } catch {
            /* Invalid calls remain recoverable tool errors. */
          }
        } else if (
          this.all.some((tool) => tool.function.name === call.function?.name)
        ) {
          this.loaded.add(call.function.name);
        }
      })
    );
  }

  tools() {
    return [
      this.discoveryTool(),
      AI_TASK_MEMORY_TOOL,
      ...this.all.filter((tool) => this.loaded.has(tool.function.name)),
    ];
  }

  preloadIntent(prompt: string) {
    const names = intentBundles
      .filter((bundle) => bundle.pattern.test(prompt))
      .flatMap((bundle) => bundle.tools)
      .filter((name) => this.all.some((tool) => tool.function.name === name));
    names.forEach((name) => this.loaded.add(name));
    return [...new Set(names)];
  }

  guidance() {
    return this.loaded.has('configure_site_hooks') ? hookRuntimeGuide : '';
  }

  private discoveryTool() {
    // The directory uses the same registry as executable provider schemas.
    const directory = Object.entries(families)
      .map(
        ([family, names]) =>
          `${family}: ${hints[family]} (${this.all
            .filter((tool) =>
              (names as readonly string[]).includes(tool.function.name)
            )
            .map((tool) => tool.function.name)
            .join(', ')})`
      )
      .join('; ');
    return {
      type: 'function',
      function: {
        name: 'discover_tools',
        description: `Capability directory: ${directory}. Other registered tools are already available. Load a family or search by short intent query. Search before claiming a capability is unavailable; loaded tools are not the complete toolset. Loading grants no access or approval.`,
        parameters: {
          type: 'object',
          properties: {
            family: { type: 'string', enum: Object.keys(families) },
            query: { type: 'string', minLength: 1, maxLength: 240 },
          },
          required: [] as string[],
          additionalProperties: false,
        },
      },
    };
  }

  discover(args: { family?: unknown; query?: unknown }) {
    if (args.family !== undefined) return this.load(args.family);
    if (
      typeof args.query !== 'string' ||
      !args.query.trim() ||
      args.query.length > 240
    )
      throw new Error(
        'Supply a supported family or a short intent query (1–240 characters).'
      );
    this.searchCalls += 1;
    const query = words(args.query);
    const ranked = this.all
      .map((tool) => {
        const name = tool.function.name;
        const family = Object.entries(families).find(([, names]) =>
          (names as readonly string[]).includes(name)
        )?.[0];
        const terms = new Set(
          words(`${name.replace(/_/g, ' ')} ${tool.function.description}`)
        );
        const keywords = new Set(words(family ? hints[family] : ''));
        const score =
          (args.query === name ? 100 : 0) +
          query.reduce(
            (sum, word) =>
              sum +
              (name.includes(word) ? 4 : terms.has(word) ? 2 : 0) +
              (keywords.has(word) ? 1 : 0),
            0
          );
        return { name, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);
    const exact = this.all.find((tool) => tool.function.name === args.query);
    const bundled = intentBundles
      .filter((bundle) => bundle.pattern.test(String(args.query)))
      .flatMap((bundle) => bundle.tools);
    const names = exact
      ? [exact.function.name]
      : bundled.length
      ? [...new Set(bundled)].slice(0, 5)
      : ranked
          .filter(({ score }) => score >= (ranked[0]?.score || 0) * 0.7)
          .slice(0, 3)
          .map(({ name }) => name);
    if (
      names.includes('configure_site_hooks') &&
      !names.includes('read_site_hooks')
    )
      names.unshift('read_site_hooks');
    names.forEach((name) => this.loaded.add(name));
    if (!names.length) this.searchMisses += 1;
    return {
      loaded: names,
      ...(names.includes('configure_site_hooks')
        ? { runtimeGuide: hookRuntimeGuide }
        : {}),
      instruction: names.length
        ? 'These tools are now callable. Existing access scope and review rules still apply. Load a named family if more related tools are needed.'
        : 'No matching tools found. Try another query or a named family before concluding the operation is unsupported.',
    };
  }

  has(name: string) {
    return (
      name === 'discover_tools' ||
      name === 'update_task_memory' ||
      this.loaded.has(name)
    );
  }

  load(family: unknown) {
    if (
      typeof family !== 'string' ||
      !Object.prototype.hasOwnProperty.call(families, family)
    )
      throw new Error('Choose a supported tool family.');
    const names = families[family as keyof typeof families];
    names.forEach((name) => this.loaded.add(name));
    return {
      family,
      loaded: names,
      ...(family === 'site_customization'
        ? { runtimeGuide: hookRuntimeGuide }
        : {}),
      instruction:
        'These tools are now callable. Existing access scope and review rules still apply.',
    };
  }
}
