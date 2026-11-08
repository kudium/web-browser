/** Retain revocation evidence across native approval and authentication. */
export async function withPrivateDataAction<T>(options: {
  check: () => void;
  subscribe: (changed: () => void) => () => void;
  operation: (
    check: () => void,
    retainUntil: (completion: Promise<unknown>) => void
  ) => Promise<T>;
}): Promise<T> {
  let changed = false;
  const unsubscribe = options.subscribe(() => {
    changed = true;
  });
  const check = () => {
    options.check();
    if (changed)
      throw new Error(
        'Saved data or consent changed during private-data approval.'
      );
  };
  const retained: Promise<unknown>[] = [];
  try {
    check();
    return await options.operation(check, (completion) => {
      retained.push(completion);
    });
  } finally {
    if (retained.length)
      Promise.allSettled(retained).then(unsubscribe).catch(unsubscribe);
    else unsubscribe();
  }
}

/** Release only an exact, locally reviewed snapshot to a bound AI recipient. */
export async function withReviewedAIData<T>(options: {
  read: () => T;
  recipient: () => string;
  check: () => void;
  subscribe: (changed: () => void) => () => void;
  review: (snapshot: string) => Promise<number>;
}): Promise<T> {
  const recipient = options.recipient();
  let changed = false;
  const unsubscribe = options.subscribe(() => {
    changed = true;
  });
  const check = () => {
    options.check();
    if (changed || options.recipient() !== recipient)
      throw new Error(
        'Saved data, consent or AI recipient changed during disclosure review.'
      );
  };
  try {
    check();
    const snapshot = JSON.stringify(options.read());
    if (typeof snapshot !== 'string' || Buffer.byteLength(snapshot) > 20000)
      throw new Error(
        'Too much saved information for one review. Use search_personal_data to select a smaller result.'
      );
    // An empty search/account listing contains no saved content to disclose.
    if (['[]', '{}', 'null'].includes(snapshot))
      return JSON.parse(snapshot) as T;
    const answer = await options.review(snapshot);
    check();
    if (answer !== 1)
      throw new Error(
        'User declined sharing saved information with this AI recipient.'
      );
    if (JSON.stringify(options.read()) !== snapshot)
      throw new Error('Saved information changed during disclosure review.');
    check();
    return JSON.parse(snapshot) as T;
  } finally {
    unsubscribe();
  }
}

/**
 * Session-only approval for continuing private context, never for new tool
 * data.
 */
export class AIContextConsent {
  private approvals = new Map<string, string>();

  has(context: string, recipient: string, revision: number): boolean {
    return (
      this.approvals.get(context) === JSON.stringify([recipient, revision])
    );
  }

  remember(context: string, recipient: string, revision: number): void {
    this.approvals.set(context, JSON.stringify([recipient, revision]));
  }
}

/** Direct chat sends authorize history; autonomous saved-data tasks need review. */
export function requiresAIContextReview(
  privateData: boolean,
  taskId?: string
): boolean {
  return privateData && !!taskId;
}
