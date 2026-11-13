import {
  hookConfigDiff,
  hookConfigHash,
  mergeAuthoredHooks,
} from '../main/hookReview';
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

it('reviews action source and visibility, website rules and default actions without unchanged hunks', () => {
  const action = {
    id: 'a',
    name: 'Explain',
    contexts: ['selection'] as any,
    source: 'api.showResult(context.selection);',
  };
  const old = {
    ...emptyDeveloperConfig,
    actions: [action],
    hooks: [
      {
        id: 'h',
        name: 'Tool',
        enabled: true,
        path: '/*',
        before: '',
        after: '',
        css: '',
        actions: [action],
      },
    ],
  };
  const next = {
    ...old,
    actions: [{ ...action, source: 'api.ai.compose(context.selection);' }],
    hooks: [
      {
        ...old.hooks[0],
        sites: [{ host: 'example.com', includeSubdomains: false }],
        actions: [{ ...action, contexts: ['page'] as any }],
      },
    ],
  };
  const diff = hookConfigDiff(old, next);
  expect(diff).toContain('Default hook · actions');
  expect(diff).toContain('api.ai.compose');
  expect(diff).toContain('Tool · actions');
  expect(diff).toContain('Tool · sites');
  expect(hookConfigDiff(old, JSON.parse(JSON.stringify(old)))).toBe(
    'No script or target changes.'
  );
});

it('preserves site-hook metadata, default actions and omitted optional fields by stable ID', () => {
  const action = {
    id: 'a',
    name: 'Action',
    contexts: ['page'] as any,
    source: 'api.showResult(context.title);',
  };
  const current = {
    ...emptyDeveloperConfig,
    name: 'Named default',
    actions: [action],
    hooks: [
      {
        id: 'h',
        name: 'Original',
        enabled: true,
        path: '/*',
        before: '',
        after: '',
        css: '',
        actions: [action],
        sites: [{ host: 'example.com', includeSubdomains: false }],
        publication: {
          id: 'listing',
          version: 1,
          description: 'Original',
          license: 'MIT' as const,
        },
      },
    ],
  };
  const proposed = {
    ...emptyDeveloperConfig,
    hooks: [
      {
        id: 'h',
        name: 'Edited',
        enabled: true,
        path: '/*',
        before: '',
        after: '',
        css: 'p { color: red; }',
      },
    ],
  };
  const merged = mergeAuthoredHooks(current, proposed);
  expect(merged.name).toBe(current.name);
  expect(merged.actions).toEqual([action]);
  expect(merged.hooks![0]).toMatchObject({
    name: 'Edited',
    actions: [action],
    sites: current.hooks[0].sites,
    publication: current.hooks[0].publication,
  });
  expect(hookConfigHash(current)).not.toBe(hookConfigHash(merged));
  expect(hookConfigHash(current)).not.toBe(
    hookConfigHash({
      ...current,
      actions: [{ ...action, source: 'return "Changed";' }],
    })
  );
});

it('retains unmentioned site hooks and requires explicit removal without conflicting edits', () => {
  const first = {
    id: 'a',
    name: 'First',
    enabled: true,
    path: '/*',
    before: '',
    after: '',
    css: '',
  };
  const second = { ...first, id: 'b', name: 'Second' };
  const current = { ...emptyDeveloperConfig, hooks: [first, second] };
  const edit = {
    ...emptyDeveloperConfig,
    hooks: [{ ...first, name: 'Edited' }],
  };
  expect(mergeAuthoredHooks(current, edit).hooks).toEqual([
    { ...first, name: 'Edited' },
    second,
  ]);
  expect(mergeAuthoredHooks(current, edit, ['b']).hooks).toEqual([
    { ...first, name: 'Edited' },
  ]);
  expect(() => mergeAuthoredHooks(current, edit, ['a'])).toThrow('not also');
  expect(() => mergeAuthoredHooks(current, edit, ['missing'])).toThrow(
    'existing'
  );
});
