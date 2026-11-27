/** @jest-environment node */
import {
  aiGroupTier,
  aiModelTier,
  classifyRequest,
  nextAIModelTier,
  routeRequest,
} from '../browser/aiModelTiers';
import { APPLE_AI_ENDPOINT } from '../browser/aiProviders';

it('maps endpoints to tiers', () => {
  expect(aiModelTier(APPLE_AI_ENDPOINT)).toBe('assist');
  expect(aiModelTier('http://localhost:11434/v1')).toBe('control');
  expect(aiModelTier('https://api.openai.com/v1')).toBe('cloud');
  expect(nextAIModelTier('assist')).toBe('control');
  expect(nextAIModelTier('cloud')).toBeUndefined();
  expect(aiGroupTier('control')).toBe('control');
  expect(aiGroupTier('nope')).toBe('auto');
});

it('classifies requests by shape without any model call', () => {
  expect(classifyRequest('Summarize this page')).toMatchObject({ tier: 'assist', confident: true });
  expect(classifyRequest('What tab am I on?')).toMatchObject({ tier: 'assist', confident: true });
  expect(classifyRequest('Click Save and then reload')).toMatchObject({ tier: 'control', reason: 'action verb' });
  expect(classifyRequest('https://app.test/settings')).toMatchObject({ tier: 'control', reason: 'URL reference' });
  expect(classifyRequest('look at @work/dashboard', { hasTabReference: true })).toMatchObject({ tier: 'control' });
  expect(
    classifyRequest(
      'Research the best project management tools across https://a.test and https://b.test and compare pricing'
    )
  ).toMatchObject({ tier: 'cloud', confident: true });
  expect(classifyRequest(`${'word '.repeat(130)}`)).toMatchObject({ tier: 'cloud' });
  expect(classifyRequest('hello there')).toMatchObject({ tier: 'assist', confident: false });
});

it('routes with the group override first, warms local control models and flags bigger tasks', () => {
  const override = routeRequest('Summarize', 'http://localhost:11434/v1', 'cloud');
  expect(override).toMatchObject({ tier: 'cloud', reason: 'group setting', current: 'control', warm: true });
  expect(override.notice).toContain('cloud task');
  const assist = routeRequest('Click Save', APPLE_AI_ENDPOINT, 'auto');
  expect(assist).toMatchObject({ tier: 'control', current: 'assist', warm: false });
  expect(assist.notice).toContain('Install a local model');
  const fine = routeRequest('Click Save', 'http://localhost:11434/v1', undefined);
  expect(fine.notice).toBeUndefined();
  expect(fine.warm).toBe(true);
});
