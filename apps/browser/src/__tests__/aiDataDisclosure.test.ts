/** @jest-environment node */
import {
  AIContextConsent,
  requiresAIContextReview,
  withReviewedAIData,
} from '../main/aiDataDisclosure';

function fixture() {
  let changed: (() => void) | undefined;
  const unsubscribe = jest.fn(() => {
    changed = undefined;
  });
  const value = {
    title: 'Profile',
    fields: [{ name: 'role', value: 'private fixture fact' }],
  };
  const options = {
    read: jest.fn(() => value),
    recipient: jest.fn(() => 'provider/model/credential-identity'),
    check: jest.fn(),
    subscribe: jest.fn((listener: () => void) => {
      changed = listener;
      return unsubscribe;
    }),
    review: jest.fn(async (_snapshot: string) => 1),
  };
  return { options, value, unsubscribe, revoke: () => changed?.() };
}

it('reviews exact content, rereads before release, and returns an independent snapshot', async () => {
  const { options, value, unsubscribe } = fixture();
  const result = await withReviewedAIData(options);
  expect(options.review).toHaveBeenCalledWith(JSON.stringify(value));
  expect(options.read).toHaveBeenCalledTimes(2);
  value.fields[0].value = 'subsequently changed';
  expect(result.fields[0].value).toBe('private fixture fact');
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('a decline never releases or rereads the snapshot', async () => {
  const { options, unsubscribe } = fixture();
  options.review.mockResolvedValue(0);
  await expect(withReviewedAIData(options)).rejects.toThrow(
    'User declined sharing'
  );
  expect(options.read).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('revokes even when consent/data changes and is restored to the same value', async () => {
  const { options, revoke, unsubscribe } = fixture();
  options.review.mockImplementation(async () => {
    revoke();
    return 1;
  });
  await expect(withReviewedAIData(options)).rejects.toThrow(
    'consent or AI recipient changed'
  );
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('rejects a changed result even if an observer missed the mutation', async () => {
  const { options, value, unsubscribe } = fixture();
  options.review.mockImplementation(async () => {
    value.fields[0].value = 'changed';
    return 1;
  });
  await expect(withReviewedAIData(options)).rejects.toThrow(
    'Saved information changed'
  );
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it.each(['recipient', 'Stop', 'owner'])(
  'rejects %s changes and cleans up',
  async (reason) => {
    const { options, unsubscribe } = fixture();
    options.review.mockImplementation(async () => {
      if (reason === 'recipient')
        options.recipient.mockReturnValue('another-provider');
      else
        options.check.mockImplementation(() => {
          throw new Error(reason);
        });
      return 1;
    });
    await expect(withReviewedAIData(options)).rejects.toThrow();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  }
);

it('empty results need no disclosure grant', async () => {
  const { options, unsubscribe } = fixture();
  await expect(
    withReviewedAIData({ ...options, read: () => [] })
  ).resolves.toEqual([]);
  expect(options.review).not.toHaveBeenCalled();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('rejects oversized results before showing or releasing data', async () => {
  const { options, unsubscribe } = fixture();
  await expect(
    withReviewedAIData({ ...options, read: () => 'private'.repeat(4000) })
  ).rejects.toThrow('Too much saved information');
  expect(options.review).not.toHaveBeenCalled();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('unsubscribes when reading or the native review fails', async () => {
  const { options, unsubscribe } = fixture();
  options.review.mockRejectedValue(new Error('Native review closed'));
  await expect(withReviewedAIData(options)).rejects.toThrow(
    'Native review closed'
  );
  options.read.mockImplementation(() => {
    throw new Error('Vault unavailable');
  });
  await expect(withReviewedAIData(options)).rejects.toThrow(
    'Vault unavailable'
  );
  expect(unsubscribe).toHaveBeenCalledTimes(2);
});

it('private website actions retain consent revocation through native approval', async () => {
  const { options, revoke, unsubscribe } = fixture();
  const { withPrivateDataAction } = await import('../main/aiDataDisclosure');
  let effects = 0;
  await expect(
    withPrivateDataAction({
      check: options.check,
      subscribe: options.subscribe,
      operation: async (check) => {
        await Promise.resolve();
        revoke();
        check();
        effects += 1;
      },
    })
  ).rejects.toThrow('consent changed');
  expect(effects).toBe(0);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('retains private-data checks until a pending native action completes', async () => {
  const { options, revoke, unsubscribe } = fixture();
  const { withPrivateDataAction } = await import('../main/aiDataDisclosure');
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let checkLater!: () => void;
  await withPrivateDataAction({
    check: options.check,
    subscribe: options.subscribe,
    operation: async (check, retainUntil) => {
      checkLater = check;
      retainUntil(pending);
      return { pending: true };
    },
  });
  expect(unsubscribe).not.toHaveBeenCalled();
  revoke();
  expect(checkLater).toThrow('consent changed');
  complete();
  await pending;
  await Promise.resolve();
  await Promise.resolve();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

describe('private chat context consent', () => {
  it('remembers approval only for the same context, recipient and consent revision', () => {
    const consent = new AIContextConsent();
    expect(consent.has('chat:one', 'provider/model/key', 1)).toBe(false);
    consent.remember('chat:one', 'provider/model/key', 1);
    expect(consent.has('chat:one', 'provider/model/key', 1)).toBe(true);
    expect(consent.has('chat:two', 'provider/model/key', 1)).toBe(false);
    expect(consent.has('task:one', 'provider/model/key', 1)).toBe(false);
    expect(consent.has('chat:one', 'other-provider/model/key', 1)).toBe(false);
    expect(consent.has('chat:one', 'provider/other-model/key', 1)).toBe(false);
    expect(consent.has('chat:one', 'provider/model/other-key', 1)).toBe(false);
    expect(consent.has('chat:one', 'provider/model/key', 2)).toBe(false);
    expect(
      new AIContextConsent().has('chat:one', 'provider/model/key', 1)
    ).toBe(false);
  });

  it('replaces previous recipient approval after approving a different recipient', () => {
    const consent = new AIContextConsent();
    consent.remember('chat:one', 'first', 1);
    consent.remember('chat:one', 'second', 1);
    expect(consent.has('chat:one', 'first', 1)).toBe(false);
    expect(consent.has('chat:one', 'second', 1)).toBe(true);
  });

  it('keeps new saved-data requests subject to exact review and denial', async () => {
    const { options } = fixture();
    await withReviewedAIData(options);
    options.review.mockResolvedValueOnce(0);
    await expect(withReviewedAIData(options)).rejects.toThrow('declined');
    expect(options.review).toHaveBeenCalledTimes(2);
  });
});

it.each([null, {}])(
  'does not ask for approval when no saved data exists: %p',
  async (value) => {
    const { options } = fixture();
    const read = jest.fn(() => value);
    expect(await withReviewedAIData({ ...options, read })).toEqual(value);
    expect(options.review).not.toHaveBeenCalled();
  }
);

it.each([true, false])(
  'direct chat does not need a history-sharing prompt, saved-data status %s',
  (privateData) => {
    expect(requiresAIContextReview(privateData)).toBe(false);
  }
);

it('retains saved-context review for autonomous tasks only', () => {
  expect(requiresAIContextReview(true, 'scheduled-task')).toBe(true);
  expect(requiresAIContextReview(false, 'scheduled-task')).toBe(false);
});
