import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { DeveloperTerminal } from '../components/UI/DeveloperTerminal';
const mockPaste = jest.fn();
const mockFocus = jest.fn();
let mockInput: (data: string) => void;
jest.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options: any = {};
    loadAddon() {}
    open() {}
    write() {}
    dispose() {}
    focus = mockFocus;
    onResize() {
      return { dispose() {} };
    }
    onData(cb: (data: string) => void) {
      mockInput = cb;
      return { dispose() {} };
    }
    attachCustomKeyEventHandler() {}
    paste(data: string) {
      mockPaste(data);
      mockInput(data);
    }
  },
}));
jest.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}));
jest.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
const state = {
  running: true,
  data: '',
  sequence: 0,
  tabs: [{ id: 'one', name: 'Terminal', running: true }],
  selected: 'one',
  open: true,
  height: 220,
};
beforeEach(() => {
  jest.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = jest.fn();
  Object.assign(global, {
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  Object.assign(window, {
    electron: {
      platform: 'darwin',
      siteDeveloper: {
        terminal: jest.fn().mockResolvedValue(state),
        onTerminal: () => () => {},
        droppedFilePaths: jest.fn().mockReturnValue(['/Projects/Atlas Studio']),
        linkDroppedProject: jest.fn(),
      },
    },
  });
});
test('dropping a folder anywhere in the terminal inserts its path without relinking or executing it', async () => {
  render(
    <Theme>
      <DeveloperTerminal group="work" active />
    </Theme>
  );
  await waitFor(() =>
    expect(window.electron.siteDeveloper.terminal).toHaveBeenCalledWith(
      'work',
      expect.objectContaining({ action: 'attach' })
    )
  );
  const file = new File([], 'Atlas Studio');
  fireEvent.drop(screen.getByRole('region', { name: 'Project terminal' }), {
    dataTransfer: { files: [file], types: ['Files'] },
  });
  await waitFor(() =>
    expect(mockPaste).toHaveBeenCalledWith("'/Projects/Atlas Studio' ")
  );
  expect(window.electron.siteDeveloper.terminal).toHaveBeenCalledWith('work', {
    action: 'write',
    tab: 'one',
    data: "'/Projects/Atlas Studio' ",
  });
  expect(
    window.electron.siteDeveloper.linkDroppedProject
  ).not.toHaveBeenCalled();
});

test('resizes terminal live through capture loss and saves only the final height', async () => {
  Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent });
  HTMLElement.prototype.setPointerCapture = jest.fn();
  const view = render(<Theme><DeveloperTerminal group="group" active /></Theme>);
  const handle = await screen.findByRole('separator', { name: 'Resize terminal' });
  const callbacks = new Map<number, FrameRequestCallback>(); let next = 0;
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => { callbacks.set(++next, fn); return next; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id); });
  const terminal = window.electron.siteDeveloper.terminal as jest.Mock;
  terminal.mockClear();
  fireEvent.pointerDown(handle, { button: 0, clientY: 500 });
  fireEvent.lostPointerCapture(handle);
  fireEvent.pointerMove(window, { clientY: 480 });
  fireEvent.pointerMove(window, { clientY: 440 });
  expect(callbacks.size).toBe(1);
  expect(terminal).not.toHaveBeenCalled();
  fireEvent.pointerUp(window, { clientY: 400 });
  await waitFor(() => expect(terminal).toHaveBeenCalledWith('group', { action: 'preferences', height: 320 }));
  expect(terminal).toHaveBeenCalledTimes(1);
  view.unmount(); raf.mockRestore(); cancel.mockRestore();
});
