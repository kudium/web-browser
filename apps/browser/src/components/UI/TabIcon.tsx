import { Button } from '@radix-ui/themes';
import type { IApp } from '../../types';
import { AppIcon } from './AppIcon/AppIcon';
import { IconPicker } from './IconPicker';

export type TabAppearance = Pick<
  IApp,
  'customIconEmoji' | 'customIconImage' | 'focusColor'
>;
export function TabIcon({
  tab,
}: {
  tab: Pick<IApp, 'icon' | 'name' | 'customIconEmoji' | 'customIconImage'>;
}) {
  return tab.customIconEmoji ? (
    <span className="app-icon session-symbol" aria-hidden="true">
      {tab.customIconEmoji}
    </span>
  ) : (
    <AppIcon icon={tab.customIconImage || tab.icon} title={tab.name} />
  );
}
export function TabIconPicker({
  tab,
  onChange,
}: {
  tab: Pick<IApp, 'name' | 'icon'> & TabAppearance;
  onChange: (patch: TabAppearance) => void;
}) {
  return (
    <IconPicker
      label={`Choose tab icon: ${tab.name}`}
      emoji={tab.customIconEmoji || ''}
      image={tab.customIconImage || ''}
      preview={<TabIcon tab={tab} />}
      focusColor={tab.focusColor}
      onFocusColorChange={(color) => onChange({ focusColor: color })}
      onChange={(icon) =>
        onChange({
          customIconEmoji: icon.emoji || undefined,
          customIconImage: icon.image || undefined,
        })
      }
      renderDefaultChoice={(close) => (
        <Button
          type="button"
          variant="soft"
          color="gray"
          onClick={() => {
            onChange({
              customIconEmoji: undefined,
              customIconImage: undefined,
            });
            close();
          }}
        >
          Use website icon
        </Button>
      )}
    />
  );
}
