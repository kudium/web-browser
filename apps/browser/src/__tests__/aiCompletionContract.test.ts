import { capabilityFailure } from '../browser/aiCapabilityContracts';
import { AICompletionContract } from '../main/aiCompletionContract';
import { formatAIObservation } from '../browser/aiObservationFormat';

test.each([
  'Create a hook for this website',
  'Can you build a hook for Jiji?',
  'script this website',
  'write a custom script for this website',
])('recovers an ignored authoring request once: %s', (prompt) => {
  const contract = new AICompletionContract(prompt);
  contract.record('read_page', { text: 'Page content' });
  contract.record('test_hook', { valid: true });
  expect(contract.incomplete()).toBe(true);
  expect(contract.recovery()).toContain('native review');
  expect(contract.recovery()).toBe('');
  expect(contract.notice()).toContain('incomplete');
});

test.each([
  'summarize this website',
  'perform an operation on this website',
  'How do I create a hook?',
  'Do not create a hook for this website',
  'Create a hook for this website, code only',
  'Write a script for this website but do not install it',
])(
  'does not force installation for optional or code-only work: %s',
  (prompt) => {
    const contract = new AICompletionContract(prompt);
    expect(contract.incomplete()).toBe(false);
    expect(contract.recovery()).toBe('');
  },
);

test.each(['configure_site_hooks', 'save_global_hook'])(
  'requires verified save evidence from %s',
  (name) => {
    const contract = new AICompletionContract('create a hook');
    contract.record(name, { saved: true, verified: false });
    expect(contract.incomplete()).toBe(true);
    contract.record(name, { saved: true, verified: true, needsReload: true });
    expect(contract.incomplete()).toBe(false);
    expect(contract.snapshot()).toEqual([
      {
        capability: 'website_hook',
        status: 'saved',
        configurationVerified: true,
        runtimeVerified: false,
        needsReload: true,
      },
    ]);
  },
);

test.each(['User declined site-hook setup.', 'MCP server error'])(
  'does not automatically retry a real denial or error: %s',
  (error) => {
    const contract = new AICompletionContract('create a hook');
    contract.record('configure_site_hooks', { error });
    expect(contract.recovery()).toBe('');
    expect(contract.incomplete()).toBe(true);
    expect(contract.snapshot()[0].status).toBe('failed');
  },
);

test('an inaccessible page does not trigger another automatic attempt', () => {
  const contract = new AICompletionContract('create a hook');
  contract.record('read_page', { error: 'Access denied' });
  expect(contract.recovery()).toBe('');
  expect(contract.incomplete()).toBe(true);
});

test('save receipts and recovery limits survive continuation', () => {
  const contract = new AICompletionContract('create a hook');
  const recovery = contract.recovery();
  const messages = [
    { role: 'system', content: recovery },
    {
      role: 'assistant',
      tool_calls: [{ id: 'save', function: { name: 'configure_site_hooks' } }],
    },
    {
      role: 'tool',
      tool_call_id: 'save',
      content: formatAIObservation('configure_site_hooks', {
        saved: true,
        verified: true,
      }),
    },
  ];
  expect(new AICompletionContract('create a hook', messages).incomplete()).toBe(
    false,
  );
  expect(
    new AICompletionContract('create a hook', messages.slice(0, 1)).recovery(),
  ).toBe('');
});

test('contradictory error receipts cannot prove completion', () => {
  const contract = new AICompletionContract('create a hook');
  contract.record('configure_site_hooks', {
    saved: true,
    verified: true,
    error: 'Save failed',
  });
  expect(contract.incomplete()).toBe(true);
});

test('native denials have structured outcomes without automatic retry', () => {
  const contract = new AICompletionContract('create a hook');
  const receipt = capabilityFailure(
    'configure_site_hooks',
    'User declined site-hook setup.',
  );
  expect(receipt).toMatchObject({
    capability: 'website_hook',
    status: 'denied',
    configurationVerified: false,
  });
  contract.record('configure_site_hooks', receipt);
  expect(contract.snapshot()[0].status).toBe('denied');
  expect(contract.recovery()).toBe('');
});
test('an unverified write is not repeated automatically', () => {
  const contract = new AICompletionContract('create a hook');
  contract.record('configure_site_hooks', { saved: true, verified: false });
  expect(contract.recovery()).toBe('');
  expect(contract.incomplete()).toBe(true);
});
