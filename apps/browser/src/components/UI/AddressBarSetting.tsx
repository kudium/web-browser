import { Select, Switch } from '@radix-ui/themes';
import { preferenceControls, type BrowserPreferences } from '../../browser/preferences';

export type AddressBarSettingKey = 'addressBarPlacement' | 'addressBarFullUrl';

export function AddressBarSetting({ setting, value, disabled, onChange }: {
  setting: AddressBarSettingKey;
  value: BrowserPreferences[AddressBarSettingKey];
  disabled?: boolean;
  onChange: (patch: Partial<BrowserPreferences>) => void;
}) {
  const control = preferenceControls.find((item) => item.key === setting)!;
  if (control.kind === 'toggle') return (
    <Switch
      aria-label={control.title}
      checked={value === true}
      disabled={disabled}
      onCheckedChange={(next) => onChange({ [setting]: next })}
    />
  );
  return (
    <Select.Root
      value={String(value)}
      disabled={disabled}
      onValueChange={(next) => onChange({ [setting]: next })}
    >
      <Select.Trigger aria-label={control.title} />
      <Select.Content>
        {control.options?.map((option) => (
          <Select.Item key={option.value} value={String(option.value)}>{option.label}</Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
