import { ArrowRight, FolderPlus, Import, Palette } from 'lucide-react';
import { PreferenceHint } from './PreferenceHint';

export function EmptySpaceWelcome({
  onAction,
}: {
  onAction: (
    action: 'new-tab' | 'new-group' | 'import-group' | 'color'
  ) => void;
}) {
  return (
    <section
      className="empty-space-welcome"
      aria-label="Get started in this space"
    >
      <div className="empty-space-intro">
        <h2>Get started</h2>
        <PreferenceHint label="spaces">
          Keep related tabs and projects together. Create a group for its own
          login and optional project folder, import a saved group, or customize
          this space’s name, icon and color. Use New Tab to open a website.
        </PreferenceHint>
      </div>
      <div className="empty-space-actions">
        {(
          [
            ['new-group', FolderPlus, 'Create a group'],
            ['import-group', Import, 'Import a group'],
            ['color', Palette, 'Customize this space'],
          ] as const
        ).map(([action, Icon, title]) => (
          <button type="button" key={action} onClick={() => onAction(action)}>
            <Icon size={19} aria-hidden="true" />
            <span>
              <strong>{title}</strong>
            </span>
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
