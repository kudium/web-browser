import { Switch } from '@radix-ui/themes';
import { Slider } from 'radix-ui';
import { useState } from 'react';

type ThinkingOption = { id: string; name: string; detail?: string };

export function AIThinkingSlider({
  options,
  value,
  disabled,
  onChange,
  contextManagement,
  onContextManagementChange,
}: {
  options: ThinkingOption[];
  value: string;
  disabled: boolean;
  onChange: (nextValue: string) => Promise<void>;
  contextManagement: boolean;
  onContextManagementChange: (enabled: boolean) => Promise<void>;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.id === value)
  );
  const index = draft ?? selectedIndex;
  const selected = options[index];
  return (
    <div className="ai-model-thinking ai-thinking-slider">
      {options.length > 1 && (
        <>
          <div className="ai-thinking-slider-heading">
            <span>Thinking</span>
            <strong>{selected.name.replace('Thinking: ', '')}</strong>
          </div>
          <Slider.Root
            className="rt-SliderRoot rt-r-size-1"
            min={0}
            max={options.length - 1}
            step={1}
            value={[index]}
            disabled={disabled || saving}
            onValueChange={([next]) => setDraft(next)}
            onValueCommit={async ([next]) => {
              setSaving(true);
              try {
                await onChange(options[next].id);
              } finally {
                setDraft(null);
                setSaving(false);
              }
            }}
          >
            <Slider.Track className="rt-SliderTrack">
              <Slider.Range className="rt-SliderRange" />
            </Slider.Track>
            <Slider.Thumb
              className="rt-SliderThumb"
              aria-label="Thinking level"
              aria-valuetext={selected.name.replace('Thinking: ', '')}
            />
          </Slider.Root>
          <div className="ai-thinking-slider-stops" aria-hidden="true">
            {options.map((option) => (
              <span key={option.id} data-selected={option.id === selected.id}>
                {option.name.replace('Thinking: ', '')}
              </span>
            ))}
          </div>
          <p className="ai-thinking-slider-description">{selected.detail}</p>
        </>
      )}
      <section className="ai-context-settings" aria-label="Context window">
        <div className="ai-thinking-slider-heading">
          <label htmlFor="ai-context-management">Context window</label>
          <Switch
            id="ai-context-management"
            size="1"
            aria-label="Manage context window"
            checked={contextManagement}
            disabled={disabled || saving}
            onCheckedChange={async (enabled) => {
              setSaving(true);
              try {
                await onContextManagementChange(enabled);
              } finally {
                setSaving(false);
              }
            }}
          />
        </div>
        <p className="ai-thinking-slider-description">
          Keep requests small with relevant tools and recent history. Older text
          may be abridged; completed actions stay recorded. Recommended for
          models with small context windows.
        </p>
      </section>
    </div>
  );
}
