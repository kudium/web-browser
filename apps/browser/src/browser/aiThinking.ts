import { isOllamaEndpoint, providerFor } from './aiProviders';

export const AI_THINKING = [
  'auto',
  'off',
  'on',
  'low',
  'medium',
  'high',
] as const;
export type AIThinking = (typeof AI_THINKING)[number];
export const aiThinking = (value: unknown): AIThinking =>
  AI_THINKING.includes(value as AIThinking) ? (value as AIThinking) : 'auto';

export function thinkingOptions(endpoint: string, model: string) {
  const options = [
    { id: 'auto', name: 'Thinking: Auto', detail: 'Use the model default' },
  ];
  const toggle = [
    {
      id: 'off',
      name: 'Thinking: Off',
      detail: 'Answer without extended thinking',
    },
    { id: 'on', name: 'Thinking: On', detail: 'Think before answering' },
  ];
  const levels = ['low', 'medium', 'high'].map((id) => ({
    id,
    name: `Thinking: ${id[0].toUpperCase()}${id.slice(1)}`,
    detail: {
      low: 'Faster responses',
      medium: 'Balanced thinking',
      high: 'More time for difficult tasks',
    }[id],
  }));
  if (isOllamaEndpoint(endpoint))
    return /gpt-oss/i.test(model)
      ? [...options, ...levels]
      : [...options, ...toggle];
  if (providerFor(endpoint) === 'anthropic')
    return [...options, toggle[0], ...levels];
  if (
    providerFor(endpoint) === 'gemini' ||
    (providerFor(endpoint) === 'openai' && /^(o[134]|gpt-[567])/.test(model))
  )
    return [...options, ...levels];
  return options;
}
