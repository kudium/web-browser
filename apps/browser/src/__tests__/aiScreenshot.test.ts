/** @jest-environment node */
import { captureAIPage } from '../main/aiScreenshot';
import { withAIProtocol } from '../main/aiProtocol';

jest.mock('../main/aiProtocol', () => ({ withAIProtocol: jest.fn() }));
function page() {
  return {
    isDestroyed: jest.fn(() => false),
    capturePage: jest.fn().mockResolvedValue({
      isEmpty: () => false,
      toPNG: () => Buffer.from('pixels'),
    }),
  } as any;
}
afterEach(() => jest.clearAllMocks());
it('captures webpage PNG without attaching a debugger when compositor capture works', async () => {
  const contents = page();
  await expect(
    captureAIPage(contents, new AbortController().signal)
  ).resolves.toBe(Buffer.from('pixels').toString('base64'));
  expect(withAIProtocol).not.toHaveBeenCalled();
});
it('falls back to bounded protocol capture when the compositor surface is empty', async () => {
  const contents = page();
  contents.capturePage.mockResolvedValue({ isEmpty: () => true });
  const send = jest.fn().mockResolvedValue({ data: 'png-data' });
  (withAIProtocol as jest.Mock).mockImplementation((_page, _signal, execute) =>
    execute(send)
  );
  await expect(
    captureAIPage(contents, new AbortController().signal)
  ).resolves.toBe('png-data');
  expect(send).toHaveBeenCalledWith(
    'Page.captureScreenshot',
    expect.objectContaining({ format: 'png', captureBeyondViewport: false })
  );
});
it('refuses late screenshots after Stop without falling back to another capture', async () => {
  const contents = page();
  const control = new AbortController();
  contents.capturePage.mockImplementation(async () => {
    control.abort();
    return { isEmpty: () => false, toPNG: () => Buffer.from('pixels') };
  });
  await expect(captureAIPage(contents, control.signal)).rejects.toBeDefined();
  expect(withAIProtocol).not.toHaveBeenCalled();
});
it('refuses screenshot results after the source tab closes', async () => {
  const contents = page();
  contents.isDestroyed.mockReturnValueOnce(false).mockReturnValue(true);
  await expect(
    captureAIPage(contents, new AbortController().signal)
  ).rejects.toThrow('Tab closed');
});

it('falls back after an unresponsive compositor and clears its deadline', async () => {
  jest.useFakeTimers();
  const contents = page();
  contents.capturePage.mockReturnValue(new Promise(() => {}));
  const send = jest.fn().mockResolvedValue({ data: 'fallback-png' });
  (withAIProtocol as jest.Mock).mockImplementation((_page, _signal, execute) =>
    execute(send)
  );
  const pending = captureAIPage(contents, new AbortController().signal);
  await jest.advanceTimersByTimeAsync(1000);
  await expect(pending).resolves.toBe('fallback-png');
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
