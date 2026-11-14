import {
  emptyDeveloperConfig,
  hookMatchesPath,
  validDeveloperConfig,
} from '../browser/siteDeveloper';
import { hookScriptHash } from '../main/hookNotifications';
import { aiToolParameters } from '../browser/aiToolSchemas';

jest.mock('../main/passwordManager', () => ({}));

jest.mock('../main/localStorage', () => ({
  safeStorage: jest.requireMock('electron').safeStorage,
}));

const hook = {
  id: 'account',
  name: 'Account',
  enabled: true,
  path: '/account/*',
  before: '',
  after: 'log(url)',
  css: '',
};
test('pathname globs are anchored and ignore query and hash', () => {
  expect(
    hookMatchesPath(
      '/account/*',
      'https://example.com/account/settings?next=/other#test'
    )
  ).toBe(true);
  expect(
    hookMatchesPath('/account/*', 'https://example.com/other/account/settings')
  ).toBe(false);
  expect(hookMatchesPath('/a.b', 'https://example.com/axb')).toBe(false);
  expect(hookMatchesPath('/a.b', 'https://example.com/a.b')).toBe(true);
});
test('legacy configs remain valid; named hooks are bounded and unique', () => {
  expect(validDeveloperConfig(emptyDeveloperConfig)).toBe(true);
  expect(validDeveloperConfig({ ...emptyDeveloperConfig, hooks: [hook] })).toBe(
    true
  );
  expect(
    validDeveloperConfig({ ...emptyDeveloperConfig, hooks: [hook, hook] })
  ).toBe(false);
  expect(
    validDeveloperConfig({
      ...emptyDeveloperConfig,
      hooks: [{ ...hook, path: 'https://other.test/*' }],
    })
  ).toBe(false);
  expect(
    validDeveloperConfig({
      ...emptyDeveloperConfig,
      hooks: [{ ...hook, after: 'a'.repeat(20001) }],
    })
  ).toBe(false);
});
test('notification permission fingerprint binds filters and every hook source', () => {
  const config = { ...emptyDeveloperConfig, hooks: [hook] };
  expect(hookScriptHash(config)).not.toBe(
    hookScriptHash({ ...config, hooks: [{ ...hook, path: '/other/*' }] })
  );
  expect(hookScriptHash(config)).not.toBe(
    hookScriptHash({ ...config, hooks: [{ ...hook, after: 'page.reload()' }] })
  );
});
test('feedback and private-input tools have explicit schemas for external clients', () => {
  expect(aiToolParameters('request_user_feedback').required).toEqual([
    'title',
    'reason',
  ]);
  expect(aiToolParameters('request_personal_data').required).toEqual([
    'title',
    'reason',
    'fieldNames',
  ]);
});
