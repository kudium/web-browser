export const AI_PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4.1',
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
    model: 'claude-sonnet-4-5',
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
    model: 'qwen-plus',
  },
  {
    id: 'kimi',
    label: 'Moonshot Kimi',
    endpoint: 'https://api.moonshot.ai/v1',
    model: 'kimi-k2.6',
  },
  {
    id: 'glm',
    label: 'Z.ai GLM',
    endpoint: 'https://api.z.ai/api/paas/v4',
    model: 'glm-4.7',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    endpoint: 'https://api.minimax.io/v1',
    model: 'MiniMax-M2.5',
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    endpoint: 'https://api.x.ai/v1',
    model: 'grok-4',
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
    model: 'openai/gpt-4.1',
  },
  { id: 'custom', label: 'Custom', endpoint: '', model: '' },
];
export const providerFor = (endpoint: string) =>
  AI_PROVIDERS.find((item) => item.endpoint === endpoint.replace(/\/$/, ''))
    ?.id || 'custom';
