import { Popover, Button, Switch, Select } from '@radix-ui/themes';
import { Languages, LoaderCircle, ChevronRight } from 'lucide-react';
import type { BrowserState } from '../../browser/contracts';
import { ChromeIconButton } from './ChromeIconButton';
export function PageTranslationButton({ state, action }: {
  state?: BrowserState['translation'];
  action: (action: 'page-translate' | 'page-translation-original' | 'page-translation-always' | 'page-translation-target', target?: string) => void;
}) {
  if (!state || !(state.needed || state.translated || state.translating || state.error)) return null;
  const loading = state.phase === 'downloading' ? 'Downloading language pack…' : 'Translating page…';
  return <Popover.Root>
    <Popover.Trigger>
      <ChromeIconButton icon={state.translating ? LoaderCircle : Languages} className={`translation-toggle ${state.translating ? 'translation-busy' : ''}`} label={state.translating ? loading : 'Page translation'} aria-busy={state.translating} />
    </Popover.Trigger>
    <Popover.Content className="page-translation-popover" sideOffset={8} align="end">
      <div className="translation-popup-heading">
        <div className="translation-language-pair"><span>{state.source === 'auto' ? 'Detected language' : state.sourceName}</span><ChevronRight size={14} />
          {state.targets?.length ? <Select.Root value={state.target} onValueChange={target => action('page-translation-target', target)}><Select.Trigger className="translation-target-trigger" variant="ghost" aria-label="Translate to">{state.targetName}</Select.Trigger><Select.Content>{state.targets.map(item => <Select.Item key={item.code} value={item.code}>{item.name}</Select.Item>)}</Select.Content></Select.Root> : <strong>{state.targetName}</strong>}
        </div>
      </div>
      {state.translating && <div className="translation-progress" role="status"><LoaderCircle size={15} />{loading}</div>}
      {state.error && <p className="translation-error" role="alert">{state.error}</p>}
      {!state.translating && <Button color="gray" variant="solid" className="translation-popup-action" disabled={state.translating} onClick={() => action(state.translated ? 'page-translation-original' : 'page-translate')}>{state.translated ? 'Show original language' : state.error ? 'Try again' : 'Translate page'}</Button>}
      {state.source !== 'auto' && <label className="translation-always"><span>Always translate {state.sourceName}</span><Switch size="1" checked={state.always} onCheckedChange={() => action('page-translation-always')} /></label>}
    </Popover.Content>
  </Popover.Root>;
}
