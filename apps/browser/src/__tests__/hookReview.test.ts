import { hookConfigDiff } from '../main/hookReview';
import { emptyDeveloperConfig } from '../browser/siteDeveloper';

it('shows changed script lines and enabled state without unrelated hooks', () => {
  const first = {
    id: 'a',
    name: 'A',
    path: '/*',
    enabled: true,
    before: '',
    after: 'log("same");\nlog("old");\nlog("end");',
    css: '',
  };
  const second = { ...first, id: 'b', name: 'B', after: 'unrelated()' };
  const current = { ...emptyDeveloperConfig, hooks: [first, second] };
  const proposed = {
    ...current,
    enabled: true,
    hooks: [{ ...first, after: first.after.replace('old', 'new') }, second],
  };
  const diff = hookConfigDiff(current, proposed);
  expect(diff).toContain('- log("old");');
  expect(diff).toContain('+ log("new");');
  expect(diff).toContain('A · after · line 2');
  expect(diff).toContain('- false\n+ true');
  expect(diff).not.toContain('unrelated');
  expect(diff).not.toContain('log("same")');
});

it('represents added and removed hooks including their page targets', () => {
  const config = {
    ...emptyDeveloperConfig,
    hooks: [
      {
        id: 'a',
        name: 'A',
        path: '/prices/*',
        enabled: true,
        before: '',
        after: 'log(url)',
        css: '',
      },
    ],
  };
  expect(hookConfigDiff(emptyDeveloperConfig, config)).toContain('+ /prices/*');
  expect(hookConfigDiff(config, emptyDeveloperConfig)).toContain('- log(url)');
  expect(hookConfigDiff(config, config)).toBe('No script or target changes.');
});
