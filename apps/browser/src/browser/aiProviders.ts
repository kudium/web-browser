export const APPLE_AI_ENDPOINT = 'https://apple-intelligence.invalid/v1';
export const isAppleAIEndpoint = (endpoint: string) =>
  endpoint.replace(/\/$/, '') === APPLE_AI_ENDPOINT;
export const isLocalAIEndpoint = (endpoint: string) =>
  isAppleAIEndpoint(endpoint) || isOllamaEndpoint(endpoint);

export const AI_PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-6.1-sol',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.8-flash',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    endpoint: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-5-5',
  },
  {
    id: 'meta',
    label: 'Meta Muse',
    endpoint: 'https://api.meta.ai/v1',
    model: 'muse-spark-1.3',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    endpoint: 'https://api.deepseek.com',
    model: 'deepseek-flash',
  },
  {
    id: 'qwen',
    label: 'Alibaba Qwen',
    endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.7-plus',
  },
  {
    id: 'kimi',
    label: 'Moonshot Kimi',
    endpoint: 'https://api.moonshot.ai/v1',
    model: 'kimi-k3',
  },
  {
    id: 'glm',
    label: 'Z.ai GLM',
    endpoint: 'https://api.z.ai/api/paas/v4',
    model: 'glm-5.3',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    endpoint: 'https://api.minimax.io/v1',
    model: 'MiniMax-M3.1-Flash',
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    endpoint: 'https://api.x.ai/v1',
    model: 'grok-4.7',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-6.1-sol',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    endpoint: 'http://localhost:11434/v1',
    model: '',
  },
  {
    id: 'apple',
    label: 'Apple Intelligence — Local Mac',
    endpoint: APPLE_AI_ENDPOINT,
    model: 'apple-on-device',
  },
  { id: 'custom', label: 'Custom', endpoint: '', model: '' },
];
// API IDs checked against provider model catalogs on 2026-11-07.
// Examples are starting points; Refresh models lists account-specific availability.
export const AI_MODEL_EXAMPLES: Record<string, string[]> = {
  meta: [
    'muse-spark-1.3',
    'muse-wonder-1.0',
    'muse-spark-1.2',
    'muse-spark-1.1',
  ],
  openai: [
    'gpt-6-luna',
    'gpt-6.1-terra',
    'gpt-6.1-sol',
    'gpt-6-astra',
    'gpt-5.4-mini',
  ],
  gemini: [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-4-argon',
  ],
  anthropic: [
    'claude-haiku-5-5',
    'claude-sonnet-5-5',
    'claude-opus-5-5',
    'claude-fable-5-1',
  ],
  deepseek: ['deepseek-flash', 'deepseek-v4-pro'],
  qwen: ['qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-max'],
  kimi: [
    'kimi-k3',
    'kimi-k3.1-pro',
    'kimi-k3.1-pro-highspeed',
    'kimi-k2.7-code',
  ],
  glm: ['glm-5.3-flash', 'glm-5.3'],
  minimax: ['MiniMax-M3.1-Flash', 'MiniMax-M3'],
  xai: ['grok-4.7', 'grok-4.6', 'grok-code-fast-1'],
  mistral: [
    'mistral-small-latest',
    'mistral-medium-latest',
    'mistral-large-latest',
  ],
  openrouter: [
    'google/gemini-3.5-flash-lite',
    'google/gemini-3.8-flash',
    'google/gemini-4-argon',
    'openai/gpt-6-luna',
    'openai/gpt-6.1-sol',
    'anthropic/claude-haiku-5.5',
    'anthropic/claude-sonnet-5.5',
    'moonshotai/kimi-k3.1-pro',
  ],
};

/** Ollama's default local OpenAI-compatible server needs no API key. */
export function isOllamaEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.port === '11434' &&
      url.pathname.replace(/\/$/, '') === '/v1' &&
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export const providerFor = (endpoint: string) =>
  isOllamaEndpoint(endpoint)
    ? 'ollama'
    : AI_PROVIDERS.find((item) => item.endpoint === endpoint.replace(/\/$/, ''))
        ?.id || 'custom';
