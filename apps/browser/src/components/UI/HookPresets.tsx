/* eslint-disable react/require-default-props */
import { useState } from 'react';
import { Button, Dialog, TextField } from '@radix-ui/themes';
import { Sparkles, BookOpen } from 'lucide-react';
import { HookExamples } from './HookExamples';
import type { HookStage } from '../../browser/hookExamples';
import { HookAISetup } from './HookAISetup';
import { hookExamples, HookExample } from '../../browser/hookExamples';

const descriptions: Record<string, string> = {
  'dark-mode': 'A dark theme for pages without one. Results vary by site.',
  'accent-colors': 'Change link and control colors.',
  'panel-markdown': 'Render formatted output in the shared sidebar.',
  'panel-table': 'Inspect page links in a full-width output table.',
  'panel-json': 'Inspect structured page data without injecting a page overlay.',
  'panel-status': 'Publish status updates and a reusable Refresh action.',
  'panel-media': 'Browse page images, videos and audio with local thumbnails, source links and paging.',
  'panel-html': 'Build a sandboxed dashboard with retained inputs and hook actions.',
  'auto-scroll': 'A floating scroll control, with pause and Escape support.',
  'image-urls':
    'Show source links beneath images, including newly loaded images.',
  'page-activity': 'Record the page in Activity on each load or route change.',
  'layout-outlines': 'Outline page elements to inspect their layout.',
  'page-note': 'Save a linked page summary to Notes.',
  starting: 'A starting point for code that runs before page load.',
  reading: 'More comfortable spacing for articles.',
  'reduce-motion': 'Reduce page animations and transitions.',
};

export function HookPresets({
  disabled,
  stage,
  source,
  canRun,
  onInsert,
  onEnable,
  onAsk,
}: {
  disabled: boolean;
  stage: HookStage;
  source: string;
  canRun: boolean;
  onInsert: (exampleSource: string, targetStage?: HookStage) => void;
  onEnable?: (example: HookExample) => void;
  onAsk?: (outcome: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('dark-mode');
  const [accent, setAccent] = useState('#5aaca8');
  const example = hookExamples.find((item) => item.id === selected)!;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button size="1" variant="ghost" color="gray" disabled={disabled}>
          <Sparkles size={14} /> Examples
        </Button>
      </Dialog.Trigger>
      <Dialog.Content className="hook-presets-dialog" maxWidth="480px" size="2">
        <Dialog.Title size="3">Make this page yours</Dialog.Title>
        <Dialog.Description size="2">
          Choose an example to customize your website.
        </Dialog.Description>
        <div className="hook-preset-list">
          {hookExamples
            .filter((item) => descriptions[item.id])
            .map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={selected === item.id}
                onClick={() => setSelected(item.id)}
              >
                <strong>{item.name}</strong>
                <span>{descriptions[item.id]}</span>
              </button>
            ))}
        </div>
        {selected === 'accent-colors' && (
          <TextField.Root
            aria-label="Accent color"
            value={accent}
            onChange={(event) => setAccent(event.target.value)}
            placeholder="#5aaca8"
          />
        )}
        <div className="hook-preset-tools">
          {onAsk && (
            <HookAISetup
              disabled={disabled}
              onAsk={(outcome) => {
                onAsk(outcome);
                setOpen(false);
              }}
            />
          )}
          <HookExamples
            stage={stage}
            source={source}
            disabled={disabled}
            onInsert={(code) => {
              onInsert(code);
              setOpen(false);
            }}
          />
          <Button asChild size="1" variant="ghost" color="gray">
            <a
              href="https://browser.kudium.com/tutorials/website-hooks"
              target="_blank"
              rel="noreferrer"
            >
              <BookOpen size={14} aria-hidden="true" />
              Help
            </a>
          </Button>
        </div>
        <div className="site-hook-enable-actions">
          <Dialog.Close>
            <Button color="gray" variant="soft">
              Cancel
            </Button>
          </Dialog.Close>
          <Button
            color="gray"
            variant="soft"
            disabled={
              disabled ||
              (selected === 'accent-colors' && !/^#[\da-f]{6}$/i.test(accent))
            }
            onClick={() => {
              onInsert(
                selected === 'accent-colors'
                  ? example.source.replaceAll('#a855f7', accent)
                  : example.source,
                example.stage
              );
              setOpen(false);
            }}
          >
            Insert code
          </Button>
          {onEnable && (
            <Button
              disabled={
                disabled ||
                !canRun ||
                (selected === 'accent-colors' && !/^#[\da-f]{6}$/i.test(accent))
              }
              onClick={() => {
                onEnable({
                  ...example,
                  source:
                    selected === 'accent-colors'
                      ? example.source.replaceAll('#a855f7', accent)
                      : example.source,
                });
                setOpen(false);
              }}
            >
              Enable &amp; run
            </Button>
          )}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
