import { Badge, RadioCards, Text } from '@radix-ui/themes';
import { Monitor, Moon, Sun, Layers } from 'lucide-react';
import {
  Appearance,
  setAppearance,
  useAppearance,
} from '../../../../utils/appearance';

// Parameter default supplies the optional prop for this function component.
// eslint-disable-next-line react/require-default-props
export function TabOption({ compact = false }: { compact?: boolean }) {
  const { preference } = useAppearance();
  return (
    <section className="tab-content">
      <div className="section-heading">
        <div>
          <strong>{compact ? 'Workspace theme' : 'Appearance'}</strong>
          <Text as="p" color="gray" size="2">
            Choose the light that suits your day.
          </Text>
        </div>
        {!compact && <Badge variant="soft">Saved automatically</Badge>}
      </div>
      <RadioCards.Root
        value={preference}
        onValueChange={(value) => setAppearance(value as Appearance)}
        columns="3"
      >
        <RadioCards.Item value="system">
          <span className="appearance-choice">
            <Monitor size={23} />
            <strong>System</strong>
          </span>
        </RadioCards.Item>
        <RadioCards.Item value="light">
          <span className="appearance-choice">
            <Sun size={23} />
            <strong>Light</strong>
          </span>
        </RadioCards.Item>
        <RadioCards.Item value="dark">
          <span className="appearance-choice">
            <Moon size={23} />
            <strong>Dark</strong>
          </span>
        </RadioCards.Item>
      </RadioCards.Root>
      {!compact && (
        <div className="material-note">
          <Layers size={22} />
          <div>
            <strong>Made for your desktop</strong>
            <Text as="p" color="gray" size="2">
              Translucent surfaces on macOS. Clear, solid surfaces when reduced
              transparency is enabled.
            </Text>
          </div>
        </div>
      )}
    </section>
  );
}
