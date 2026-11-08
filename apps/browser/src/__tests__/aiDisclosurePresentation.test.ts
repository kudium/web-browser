/** @jest-environment node */
import {
  aiDisclosureDetail,
  readableAIData,
} from '../main/aiDisclosurePresentation';
import {
  requiresAIPrivateReview,
  requiresAIApproval,
} from '../browser/aiPermissions';

it('shows readable shared values without internal identifiers or API syntax', () => {
  const text = aiDisclosureDetail(
    JSON.stringify([
      {
        id: 'opaque-id',
        title: 'Profile',
        fields: [{ name: 'Role', value: 'Developer' }],
        notes: 'Works remotely',
        nextOffset: null,
      },
    ]),
    'https://example.com/v1/chat/completions',
    false,
    false
  );
  expect(text).toContain('Recipient: example.com');
  expect(text).toContain('Title: Profile');
  expect(text).toContain('Role: Developer');
  expect(text).toContain('Notes: Works remotely');
  expect(text).not.toContain('opaque-id');
  expect(text).not.toContain('chat/completions');
  expect(text).not.toContain('nextOffset');
});

it('describes reused chat history without dumping the conversation', () => {
  const text = aiDisclosureDetail(
    JSON.stringify([{ role: 'user', content: 'private historical message' }]),
    'https://example.com/v1',
    false,
    true
  );
  expect(text).toContain('previous messages and replies');
  expect(text).toContain('New saved information still needs approval');
  expect(text).not.toContain('private historical message');
});

it('does not pretend to know the external client provider', () => {
  expect(
    aiDisclosureDetail('[]', 'https://example.com', true, false)
  ).toContain('its provider is unknown');
});

it('preserves long values and document passages without silently truncating', () => {
  const passage = 'Full document passage '.repeat(100);
  expect(
    readableAIData({ document: { name: 'Notes.txt', text: passage } })
  ).toContain(passage);
});

it.each(['select_tab', 'scroll', 'wheel', 'set_page_appearance'] as const)(
  'does not force private-data approval for %s but respects Ask first',
  (tool) => {
    expect(requiresAIPrivateReview(tool)).toBe(false);
    expect(requiresAIApproval('ask', tool)).toBe(true);
    expect(requiresAIApproval('standard', tool)).toBe(false);
  }
);

it.each(['navigate', 'click', 'type', 'upload_chat_attachment'] as const)(
  'still requires private-data review for %s',
  (tool) => {
    expect(requiresAIPrivateReview(tool)).toBe(true);
  }
);
