import { useState } from 'react';
import { Button, Dialog } from '@radix-ui/themes';

const storageKey = 'kudiumbrowser-whats-new-seen';

export function WhatsNewButton({
  version,
  compact = false,
}: {
  version: string;
  compact?: boolean;
}) {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || '';
    } catch {
      return '';
    }
  });
  const [open, setOpen] = useState(false);
  if (!version || seen === version) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, version);
    } catch {
      /* Keep usable without storage. */
    }
    setSeen(version);
    setOpen(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="app-update-banner">
        <button
          type="button"
          className="app-update-button"
          title={`What’s New in ${version}`}
          aria-label={`What’s New in ${version}`}
          onClick={() => setOpen(true)}
        >
          {compact ? 'New' : 'What’s New'}
        </button>
      </div>
      <Dialog.Content maxWidth="460px">
        <Dialog.Title>What’s New</Dialog.Title>
        <Dialog.Description size="2">
          Your browser is up to date · Version {version}
        </Dialog.Description>
        <div className="whats-new-highlights">
          <section>
            <h3>Easier groups</h3>
            <p>
              Create groups beside Add tab, paste URL lists, and choose Folder
              or Stack from visual examples.
            </p>
          </section>
          <section>
            <h3>More useful developer tools</h3>
            <p>
              Preview images, PDFs, media, Markdown, tables and JSON. Open files
              as tabs and run folder scripts in the built-in terminal.
            </p>
          </section>
          <section>
            <h3>Hooks you can trace</h3>
            <p>
              Try practical hook examples, see which pages have hooks, and open
              the triggering hook from its Activity badge.
            </p>
          </section>
          <section>
            <h3>A cleaner workspace</h3>
            <p>
              Find on page includes Search with AI. Downloads live in the space
              footer, and AI chat history uses the full tab height.
            </p>
          </section>
        </div>
        <Button size="2" onClick={dismiss}>
          Done
        </Button>
      </Dialog.Content>
    </Dialog.Root>
  );
}

WhatsNewButton.defaultProps = { compact: false };
