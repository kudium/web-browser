import { isAppleAIEndpoint, isOllamaEndpoint } from './aiProviders';

/**
 * Model tiers (spec 4.10). The control surface is model-agnostic; the tier
 * decides which model drives it. A zero-cost heuristic classifies a request
 * before any model call; only an ambiguous request pays for an Assist-tier
 * classification.
 */
export const AI_MODEL_TIERS = [
  {
    id: 'assist',
    name: 'Assist',
    detail:
      'Apple on-device model: intent classification, summaries, pick one of N, draft notes, fill a flow template.',
  },
  {
    id: 'control',
    name: 'Local control',
    detail:
      'Gemma 3n or Qwen 3 through Ollama: browser control with act / run_script, hook authoring, project tasks.',
  },
  {
    id: 'cloud',
    name: 'Cloud',
    detail: 'Your own API key: long multi-site tasks and research.',
  },
] as const;
export type AIModelTier = (typeof AI_MODEL_TIERS)[number]['id'];
export type AIGroupTier = AIModelTier | 'auto';

export const LOCAL_MODEL_CHOICES = [
  {
    id: 'gemma3n',
    name: 'Gemma 3n (default)',
    licence: {
      name: 'Gemma Terms of Use',
      url: 'https://ai.google.dev/gemma/terms',
      summary:
        'Permits commercial use with usage restrictions (the Gemma Prohibited Use Policy).',
    },
  },
  {
    id: 'qwen3',
    name: 'Qwen 3 (tool-calling alternative)',
    licence: { name: 'Apache 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  },
] as const;
export type LocalModelId = (typeof LOCAL_MODEL_CHOICES)[number]['id'];

/** The tier an endpoint belongs to. */
export function aiModelTier(endpoint: string): AIModelTier {
  if (isAppleAIEndpoint(endpoint)) return 'assist';
  if (isOllamaEndpoint(endpoint)) return 'control';
  return 'cloud';
}

export function nextAIModelTier(tier: AIModelTier): AIModelTier | undefined {
  if (tier === 'assist') return 'control';
  if (tier === 'control') return 'cloud';
  return undefined;
}

export const AI_TIER_SUGGESTIONS: Record<AIModelTier, string> = {
  assist:
    'Try the local control tier (Install a local model in Preferences → Assistant) or a cloud model for this task.',
  control: 'Try a cloud model with your own API key for this task.',
  cloud: 'Try a more capable model for this task.',
};

const actionVerbs =
  /\b(?:fill|autofill|click|tap|type|enter|select|choose|open|navigate|go to|visit|close|create|save|send|submit|delete|remove|change|set|configure|enable|disable|download|upload|scroll|log ?in|sign ?in|sign ?up|register|book|buy|order|pay|check ?out|install|run|test|deploy|edit|update|rename|move|add|post|reply|schedule)\b/i;
const researchCues =
  /\b(?:research|compare|across|several|multiple|all of|each of|every|best|cheapest|review|analy[sz]e|investigate|benchmark|report on|deep dive|everything about|comprehensive)\b/i;
const multiStepCues = /\b(?:and then|after that|then|next|finally|afterwards|step \d)\b/i;
const assistCues =
  /^(?:(?:please\s+)?(?:summari[sz]e|tl;?dr|what (?:is|does|are)|who (?:is|are)|which|explain|describe|translate|rewrite|rephrase|shorten|draft|classify|is this|does this|what tab|pick|choose one)\b)/i;

export interface AIRequestShape {
  hasURL?: boolean;
  hasTabReference?: boolean;
  /** Number of distinct website origins mentioned. */
  origins?: number;
}

export interface AIRoute {
  tier: AIModelTier;
  /** False when the heuristic could not decide and an Assist classification is worth it. */
  confident: boolean;
  reason: string;
}

/** Zero-cost classification by request shape: length, references and verbs. */
export function classifyRequest(prompt: string, shape: AIRequestShape = {}): AIRoute {
  const text = prompt.trim();
  const urls = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  const origins = shape.origins ?? new Set(urls.map((url) => {
    try {
      return new URL(url).origin;
    } catch {
      return url;
    }
  })).size;
  const hasURL = shape.hasURL ?? urls.length > 0;
  const hasTab = shape.hasTabReference ?? /@[a-z0-9-]+(?:\/[a-z0-9-]+)?/i.test(text);
  const words = text.split(/\s+/).filter(Boolean).length;
  // Hostnames and paths are not verbs ("app.test/settings").
  const prose = text.replace(/https?:\/\/[^\s)]+/g, ' ');
  const action = actionVerbs.test(prose);
  if (text.length > 600 || origins > 1 || (researchCues.test(text) && (words > 25 || origins > 0)))
    return { tier: 'cloud', confident: true, reason: 'long, multi-site or research request' };
  if (action || hasURL || hasTab) {
    const steps = (text.match(multiStepCues) ?? []).length;
    if (steps >= 3 && words > 60)
      return { tier: 'cloud', confident: true, reason: 'many dependent steps' };
    return { tier: 'control', confident: true, reason: action ? 'action verb' : hasURL ? 'URL reference' : 'tab reference' };
  }
  if (assistCues.test(text) && words <= 40)
    return { tier: 'assist', confident: true, reason: 'one-shot question or transformation' };
  if (words <= 12)
    return { tier: 'assist', confident: false, reason: 'short request without an action verb' };
  return { tier: 'control', confident: false, reason: 'no clear shape' };
}

/**
 * Resolve the tier for a request: the group override wins, then the heuristic.
 * Returns whether the control model should be kept warm for this run.
 */
export function routeRequest(
  prompt: string,
  endpoint: string,
  groupTier: AIGroupTier | undefined,
  shape: AIRequestShape = {},
  platform: string = typeof process !== 'undefined' ? process.platform : 'darwin'
): AIRoute & { current: AIModelTier; warm: boolean; notice?: string } {
  const current = aiModelTier(endpoint);
  const classified =
    groupTier && groupTier !== 'auto'
      ? { tier: groupTier, confident: true, reason: 'group setting' }
      : classifyRequest(prompt, shape);
  // The Assist tier is the Apple on-device model: elsewhere Local control is
  // the floor, so Auto never routes a Windows or Linux request to it.
  const route =
    platform !== 'darwin' && classified.tier === 'assist'
      ? { ...classified, tier: 'control' as AIModelTier, reason: `${classified.reason}; no on-device tier on this platform` }
      : classified;
  const warm = current === 'control';
  const higher =
    (route.tier === 'cloud' && current !== 'cloud') ||
    (route.tier === 'control' && current === 'assist');
  return {
    ...route,
    current,
    warm,
    ...(higher && route.confident
      ? {
          notice: `This looks like a ${route.tier} task (${route.reason}); the current model is the ${current} tier. ${AI_TIER_SUGGESTIONS[current]}`,
        }
      : {}),
  };
}

export function aiGroupTier(value: unknown): AIGroupTier {
  if (value === 'assist' || value === 'control' || value === 'cloud') return value;
  return 'auto';
}
