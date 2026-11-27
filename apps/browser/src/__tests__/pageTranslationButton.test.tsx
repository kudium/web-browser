import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { PageTranslationButton } from '../components/UI/PageTranslationButton';
jest.mock('../browser/client', () => ({
  browser: { tooltip: jest.fn(async () => {}) },
}));
beforeAll(() => { global.ResizeObserver = jest.fn().mockImplementation(() => ({observe:jest.fn(), unobserve:jest.fn(), disconnect:jest.fn()})) as unknown as typeof ResizeObserver; });
const state = {
  source: 'es',
  sourceName: 'Spanish',
  targetName: 'English',
  needed: true,
  translated: false,
  translating: false,
  always: false,
};
it('hides the language control when the page needs no translation', () => {
  render(
    <Theme>
      <PageTranslationButton
        state={{ ...state, needed: false }}
        action={jest.fn()}
      />
    </Theme>,
  );
  expect(screen.queryByRole('button', { name: 'Page translation' })).toBeNull();
});
it('offers direct translation and always translate without language selectors', async () => {
  const action = jest.fn();
  render(
    <Theme>
      <PageTranslationButton state={state} action={action} />
    </Theme>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Page translation' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Translate page' }),
  );
  expect(action).toHaveBeenCalledWith('page-translate');
  expect(screen.queryByRole('combobox')).toBeNull();
  fireEvent.click(screen.getByRole('switch'));
  expect(action).toHaveBeenCalledWith('page-translation-always');
});
it.each(['light', 'dark'] as const)('uses floating popup material and readable progress controls in %s mode', async appearance => {
  render(<Theme appearance={appearance}><PageTranslationButton state={{...state, translating:true, phase:'downloading'}} action={jest.fn()} /></Theme>);
  fireEvent.click(screen.getByRole('button', {name:'Downloading language pack…'}));
  expect((await screen.findByRole('status')).textContent).toContain('Downloading language pack…');
  expect(screen.queryByRole('button', {name:'Translate page'})).toBeNull();
  expect(screen.getByRole('dialog').classList.contains('app-glass-surface')).toBe(false);
  expect(screen.getByRole('switch')).toBeTruthy();
});
it('offers an obvious retry after failure', async () => {
  const action=jest.fn();
  render(<Theme><PageTranslationButton state={{...state,error:'Unable to download the language pack.'}} action={action} /></Theme>);
  fireEvent.click(screen.getByRole('button', {name:'Page translation'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to download');
  fireEvent.click(screen.getByRole('button', {name:'Try again'}));
  expect(action).toHaveBeenCalledWith('page-translate');
});
it('shows the complete target language and omits the redundant close control', async () => {
  render(<Theme><PageTranslationButton state={{...state,target:'en',targets:[{code:'en',name:'English'},{code:'fr',name:'French'}]}} action={jest.fn()} /></Theme>);
  fireEvent.click(screen.getByRole('button', {name:'Page translation'}));
  expect((await screen.findByRole('combobox', {name:'Translate to'})).textContent).toContain('English');
  expect(screen.queryByRole('button', {name:'Close translation'})).toBeNull();
});
