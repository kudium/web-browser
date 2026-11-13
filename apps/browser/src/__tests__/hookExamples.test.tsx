import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { HookExamples } from '../components/UI/HookExamples';
import {
  hookExamples,
  readHookExamples,
  saveHookExamples,
} from '../browser/hookExamples';

beforeAll(() => {
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
});
beforeEach(() => localStorage.clear());
it('stores reusable examples across page editors and rejects malformed storage', () => {
  const example = {
    id: 'custom',
    name: 'My capture',
    stage: 'after' as const,
    source: 'log(url);',
  };
  saveHookExamples([example]);
  expect(readHookExamples()).toEqual([example]);
  localStorage.setItem('kudium-hook-examples-v1', '[{"stage":"invalid"}]');
  expect(readHookExamples()).toEqual([]);
});
it('saves the current script without executing or inserting it', () => {
  const onInsert = jest.fn();
  render(
    <Theme>
      <HookExamples
        stage="after"
        source="log(url);"
        disabled={false}
        onInsert={onInsert}
      />
    </Theme>
  );
  fireEvent.keyDown(screen.getByRole('button', { name: 'Saved scripts' }), {
    key: 'ArrowDown',
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save example…' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Example name' }), {
    target: { value: 'My script' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  expect(readHookExamples()[0]).toMatchObject({
    name: 'My script',
    stage: 'after',
    source: 'log(url);',
  });
  expect(onInsert).not.toHaveBeenCalled();
});
it('provides valid callback bodies with practical page enhancements', () => {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  hookExamples
    .filter((example) => example.stage !== 'css')
    .forEach((example) => {
      expect(
        () =>
          new AsyncFunction('context', 'url', 'document', 'log', example.source)
      ).not.toThrow();
    });
  expect(
    hookExamples.some((example) =>
      example.source.includes('context.notes.create')
    )
  ).toBe(true);
  expect(hookExamples.map((example) => example.id)).toEqual(
    expect.arrayContaining([
      'dark-mode',
      'accent-colors',
      'auto-scroll',
      'image-urls',
      'layout-outlines',
    ])
  );
});
it('edits and deletes saved examples without modifying the page script', () => {
  saveHookExamples([
    { id: 'saved', name: 'Capture', stage: 'after', source: 'log(url);' },
  ]);
  const onInsert = jest.fn();
  render(
    <Theme>
      <HookExamples
        stage="after"
        source=""
        disabled={false}
        onInsert={onInsert}
      />
    </Theme>
  );
  fireEvent.keyDown(screen.getByRole('button', { name: 'Saved scripts' }), {
    key: 'ArrowDown',
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Manage examples…' }));
  fireEvent.click(screen.getByRole('button', { name: 'Capture After load' }));
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Saved example name' }),
    { target: { value: 'Renamed' } }
  );
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Saved example script' }),
    { target: { value: 'log("Updated");' } }
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(readHookExamples()[0]).toMatchObject({
    name: 'Renamed',
    source: 'log("Updated");',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Delete Renamed' }));
  expect(readHookExamples()).toEqual([]);
  expect(screen.getByText(/No saved scripts/)).toBeVisible();
  expect(onInsert).not.toHaveBeenCalled();
});

it('applies visual helpers without duplicating styles, image labels or scroll controls', async () => {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  document.body.innerHTML =
    '<main><img src="https://example.com/photo.jpg"></main>';
  const cleanups: (() => void)[] = [];
  const context = {
    onCleanup: (cleanup: () => void) => cleanups.push(cleanup),
  };
  for (const id of [
    'dark-mode',
    'accent-colors',
    'layout-outlines',
    'image-urls',
    'auto-scroll',
  ]) {
    const example = hookExamples.find((item) => item.id === id)!;
    const run = new AsyncFunction(
      'context',
      'url',
      'document',
      'log',
      example.source
    );
    await run(context, 'https://example.com', document, jest.fn());
    await run(context, 'https://example.com', document, jest.fn());
  }
  expect(document.querySelectorAll('#kudium-dark-mode')).toHaveLength(1);
  expect(document.querySelectorAll('#kudium-accent-colors')).toHaveLength(1);
  expect(document.querySelectorAll('#kudium-layout-outlines')).toHaveLength(1);
  expect(document.querySelectorAll('[data-kudium-image-url]')).toHaveLength(1);
  expect(document.querySelector('[data-kudium-image-url]')).toHaveAttribute(
    'href',
    'https://example.com/photo.jpg'
  );
  const button = document.getElementById('kudium-auto-scroll')!;
  fireEvent.click(button);
  expect(button).toHaveTextContent('Pause auto-scroll');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(button).toHaveTextContent('Start auto-scroll');
  cleanups.reverse().forEach((cleanup) => cleanup());
  expect(document.querySelectorAll('[data-kudium-image-url]')).toHaveLength(0);
  expect(document.getElementById('kudium-auto-scroll')).toBeNull();
  button.dispatchEvent(new Event('kudium-cleanup'));
  document.dispatchEvent(new Event('kudium-image-label-cleanup'));
  [
    'kudium-dark-mode',
    'kudium-accent-colors',
    'kudium-layout-outlines',
  ].forEach((id) => document.getElementById(id)?.remove());
});

it('records the current page in Activity with its title and URL', async () => {
  const example = hookExamples.find((item) => item.id === 'page-activity')!;
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const create = jest.fn().mockResolvedValue({});
  const pageDocument = { title: 'Example page' };
  await new AsyncFunction('context', 'url', 'document', 'log', example.source)(
    { activity: { create } },
    'https://example.com/article',
    pageDocument,
    jest.fn()
  );
  expect(create).toHaveBeenCalledWith({
    title: 'Example page',
    message: 'Visited example.com',
    url: 'https://example.com/article',
  });
});
