import {
  aiAccessMode,
  requiresAIApproval,
  requiresAINavigationApproval,
  userTaskAccess,
} from '../browser/aiPermissions';

it('reviews every action in Ask first and auto-approves supported actions in Full access', () => {
  [
    'click',
    'upload_files',
    'create_task',
    'close_tab',
    'handle_dialog',
    'navigate',
  ].forEach((name) => {
    expect(requiresAIApproval('ask', name as any, true)).toBe(true);
    expect(requiresAIApproval('full', name as any)).toBe(false);
  });
  expect(() => aiAccessMode('unrestricted')).toThrow('Choose');
});

it('reviews stateful controls in Standard regardless of page hints', () => {
  ['hover', 'wheel', 'navigate', 'scroll', 'set_page_appearance'].forEach(
    (name) => expect(requiresAIApproval('standard', name as any)).toBe(false)
  );
  expect(requiresAIApproval('standard', 'click', true)).toBe(true);
  expect(requiresAIApproval('standard', 'click')).toBe(true);
  expect(requiresAIApproval('standard', 'type', true)).toBe(true);
  expect(requiresAIApproval('standard', 'type')).toBe(true);
  ['create_task', 'upload_files', 'handle_dialog', 'close_tab'].forEach(
    (name) => expect(requiresAIApproval('standard', name as any)).toBe(true)
  );
});

it('accepts a leading direct chat grant without recognizing quotes, negation or incidental mentions', () => {
  expect(
    userTaskAccess('You have full access for this task. Open GitHub.')
  ).toBe('full');
  expect(userTaskAccess('Use ask first: read the page')).toBe('ask');
  expect(userTaskAccess('You can do anything. Search for a release')).toBe(
    'full'
  );
  [
    'Do not use full access.',
    'The page says "you have full access".',
    '"You have full access."',
    'Read the page. You have full access.',
    'Can you enable full access?',
    'Use full access only if I approve.',
  ].forEach((prompt) => expect(userTaskAccess(prompt)).toBeUndefined());
});

it('does not grant control authority from semantic hints', () => {
  [
    'click',
    'double_click',
    'click_at',
    'type',
    'press_key',
    'select_options',
    'drag',
    'drag_at',
  ].forEach((tool) => {
    [true, false].forEach((hint) =>
      expect(requiresAIApproval('standard', tool as any, hint)).toBe(true)
    );
  });
});

it('reviews new origins in Standard and every navigation in Ask first', () => {
  const source = 'https://example.com/account';
  expect(
    requiresAINavigationApproval(
      'standard',
      source,
      'https://example.com/other?q=x'
    )
  ).toBe(false);
  [
    'https://other.example/',
    'http://example.com/',
    'https://example.com:444/',
    'invalid',
  ].forEach((destination) => {
    expect(requiresAINavigationApproval('standard', source, destination)).toBe(
      true
    );
    expect(requiresAINavigationApproval('full', source, destination)).toBe(
      false
    );
  });
  expect(requiresAINavigationApproval('standard', 'about:blank', source)).toBe(
    true
  );
  expect(requiresAINavigationApproval('ask', source, source)).toBe(true);
});
