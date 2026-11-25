import { useEffect, useState } from 'react';
import { Cloud, Download, Palette, Keyboard, Leaf, Globe, Sparkles, Blocks } from 'lucide-react';
import { HookIcon } from './HookIcon';
import { browser } from '../../browser/client';
import { useSyncSuggestionEligibility } from './AccountSyncSuggestion';

const key = 'kudium-browser-recommendations-v1';
const day = 86400000;
const recommendations = [
  { id: 'hooks', icon: HookIcon, title: 'Supercharge websites with hooks', description: 'Add useful tools and make websites work your way.', action: 'Explore hooks', section: '' },
  { id: 'import', icon: Download, title: 'Bring your browser with you', description: 'Import from Arc, Chrome, Dia, Edge & more.', action: 'Import browsing data', section: 'import' },
  { id: 'sync', icon: Cloud, title: 'Sync your account', description: 'Keep spaces and groups available on your other devices.', action: 'Set up sync', section: 'sync' },
  { id: 'appearance', icon: Palette, title: 'Make Kudium feel like you', description: 'Explore themes and customize your browser layout.', action: 'Customize appearance', section: 'appearance' },
  { id: 'shortcuts', icon: Keyboard, title: 'Move faster with shortcuts', description: 'Discover quick ways to switch tabs and open your tools.', action: 'Explore shortcuts', section: 'shortcuts' },
  { id: 'performance', icon: Leaf, title: 'Give your Mac some breathing room', description: 'Let inactive tabs sleep to reduce memory use.', action: 'Explore performance', section: 'performance' },
  { id: 'routing', icon: Globe, title: 'Send links to the right space', description: 'Choose where links from other apps should open.', action: 'Set up link routing', section: 'routing' },
  { id: 'ai', icon: Sparkles, title: 'Meet your browser assistant', description: 'Choose an AI model to help with pages and your workspace.', action: 'Explore Assistant', section: 'ai' },
  { id: 'extensions', icon: Blocks, title: 'Bring your favorite extensions', description: 'Use extensions in selected groups or across your browser.', action: 'Explore extensions', section: 'extensions' },
] as const;
interface RecommendationState { started: number; hiddenUntil: number; done: string[] }
function read(): RecommendationState {
  const fallback = { started: Date.now(), hiddenUntil: 0, done: [] as string[] };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && Number.isFinite(saved.started) && Number.isFinite(saved.hiddenUntil) && Array.isArray(saved.done))
      return { started: saved.started, hiddenUntil: saved.hiddenUntil, done: saved.done.filter((id: unknown) => typeof id === 'string') };
    if (localStorage.getItem('kudium-browser-import-suggestion')) fallback.done.push('import');
    if (localStorage.getItem('kudium-first-group-sync-suggestion') === 'dismissed') fallback.done.push('sync');
    localStorage.setItem(key, JSON.stringify(fallback));
  } catch { /* The current window still supports recommendations. */ }
  return fallback;
}
export function BrowserRecommendations({ onMarketplace }: { onMarketplace: () => boolean }) {
  const [state, setState] = useState(read);
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState('');
  const syncEligible = useSyncSuggestionEligibility();
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const changed = (event: StorageEvent) => { if (event.key === key) { setState(read()); refresh(); } };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', changed);
    // One wakeup at the next introduction or snooze deadline; no polling.
    const nextIntroduction = state.started + (Math.floor(Math.max(0, now - state.started) / day) + 1) * day;
    const deadline = state.hiddenUntil > now ? state.hiddenUntil : nextIntroduction;
    const timer = state.hiddenUntil > now || now - state.started < 3 * day
      ? window.setTimeout(refresh, Math.max(1, Math.min(2147483647, deadline - now))) : undefined;
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); window.removeEventListener('storage', changed); };
  }, [state.started, state.hiddenUntil, now]);
  const save = (next: RecommendationState) => {
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Keep in-memory choices. */ }
    setState(next); setNow(Date.now());
  };
  const introduced = Math.min(recommendations.length, 3 + Math.floor(Math.max(0, now - state.started) / day) * 2);
  const visible = recommendations.slice(0, introduced).filter(item => !state.done.includes(item.id) && (item.id !== 'sync' || syncEligible)).slice(0, 3);
  if (now < state.hiddenUntil || !visible.length) return null;
  return <section className="browser-recommendations" aria-label="Discover Kudium">
    <div className="recommendations-heading"><span>Discover Kudium</span><button type="button" title="Hide recommendations for 3 days" onClick={() => save({ ...state, hiddenUntil: Date.now() + 3 * day })}>Later</button></div>
    <div className="recommendation-stack">
      {visible.map(item => <article className="onboarding-suggestion recommendation-card" key={item.id}>
        <item.icon size={16} aria-hidden="true" /><div><strong>{item.title}</strong><p>{item.description}</p>
          <button type="button" onClick={async () => {
            try {
              if (item.id === 'hooks') { if (!onMarketplace()) { setError('Select an unlocked tab to explore the marketplace.'); return; } }
              else await browser.preferences('open', { section: item.section });
              setError(''); save({ ...read(), done: [...new Set([...read().done, ...state.done, item.id])] });
            } catch { setError('Could not open this feature. Please try again.'); }
          }}>{item.action}</button>
        </div>
      </article>)}
    </div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
