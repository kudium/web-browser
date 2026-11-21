import { installPersonalDataAutofill } from '../browser/personalDataAutofill';
const flush = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
beforeEach(() => {
  jest.useFakeTimers();
  jest
    .spyOn(HTMLElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as any);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});
function fixture(pending: boolean) {
  const invoke = jest.fn(async (channel: string) => {
    if (channel === 'personal-data-autofill-enabled') return true;
    if (channel === 'personal-data-login-pending')
      return pending ? { pending: true, navigated: true } : false;
    return null;
  });
  const stop = installPersonalDataAutofill({ invoke, on: jest.fn() }, () => 0);
  return { invoke, stop };
}
it('does no login scanning or recurring IPC on a page without a pending attempt', async () => {
  document.body.innerHTML = '<main>Ordinary page</main>';
  const { invoke, stop } = fixture(false);
  try {
    await flush();
    invoke.mockClear();
    const scan = jest.spyOn(document, 'querySelectorAll');
    await jest.advanceTimersByTimeAsync(10000);
    document.querySelector('main')!.textContent = 'New content';
    await jest.advanceTimersByTimeAsync(1000);
    expect(invoke).not.toHaveBeenCalled();
    expect(scan).not.toHaveBeenCalled();
  } finally {
    stop();
  }
});
it('observes a pending login and offers saving after its form disappears', async () => {
  document.body.innerHTML = '<form><input type="password"></form>';
  let shadow!: ShadowRoot;
  const original = HTMLElement.prototype.attachShadow;
  jest
    .spyOn(HTMLElement.prototype, 'attachShadow')
    .mockImplementation(function (this: HTMLElement, options) {
      shadow = original.call(this, options);
      return shadow;
    });
  const { invoke, stop } = fixture(true);
  try {
    await flush();
    await jest.advanceTimersByTimeAsync(10);
    expect(shadow).toBeUndefined();
    document.body.innerHTML = '<button>Sign out</button>';
    await jest.advanceTimersByTimeAsync(500);
    expect(
      shadow.querySelector('[aria-label="Save website login"]'),
    ).not.toBeNull();
    invoke.mockClear();
    await jest.advanceTimersByTimeAsync(10000);
    expect(invoke).not.toHaveBeenCalled();
  } finally {
    stop();
  }
});
